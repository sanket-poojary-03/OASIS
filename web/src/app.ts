import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { editWorld, generateWorld } from './api/client';
import { makeEditContext, type LookHit } from './api/editContext';
import type { EditContext, EditResult, Source } from './api/types';
import { applyOps, describeOps, OpError, type ApplyResult, type Op } from './core/ops';
import type { Recipe } from './core/recipe';
import { InteractionSystem } from './logic/interactions';
import { Wildlife } from './logic/wildlife';
import { Physics } from './physics/physics';
import { Avatar } from './player/avatar';
import { CharacterRoster } from './player/characters';
import { Player } from './player/player';
import { loadArt } from './render/artLoader';
import { AssetModelSource } from './render/assetModels';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { disposeGroup } from './render/dispose';
import { Engine } from './render/engine';
import { GrassSystem } from './render/grass';
import { setNightGlow } from './render/nightGlow';
import { PostFX } from './render/postfx';
import { addBridgeColliders, buildRoadMeshes, removeBridgeColliders } from './render/roads';
import { ScatterAssets } from './render/scatterAssets';
import { WaterSystem } from './render/water';
import { WorldObjects, type ModelSource } from './render/worldObjects';
import type { UI } from './ui/ui';
import { waitUntil } from './ui/wait';
import { buildWorld, type BuiltWorld } from './world/build';
import { snapshotField } from './world/field';
import type { Placement } from './world/placement';

export interface Cinematic { x: number; y: number; z: number; radius: number; height: number; speed: number }
/** One undo step. `atmosphereOnly` steps are undone without a geometry rebuild (spec §7 rebuild rule). */
interface Snapshot { recipe: Recipe; placements: Placement[]; atmosphereOnly: boolean }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Frame time allowed for the spawn chunk to arrive before generate() gives up (a hidden tab does not count). */
const SPAWN_TIMEOUT_MS = 20_000;
const MAX_UNDO = 50;
/** Interaction reach from the camera: 4 m at the eye, 9 m from the third-person camera 5 m behind. */
const REACH_FIRST = 4, REACH_THIRD = 9;
const SOURCE_LABEL: Record<Source, string> = { live: 'AI: live', cache: 'AI: cached answer', mock: 'AI: mock mode', offline: 'Offline mode' };

export class App {
  built: BuiltWorld | null = null;
  ui: UI | null = null;
  cinematic: Cinematic | null = null;
  /** Exactly one for the page lifetime: its fixed pool of 6 PointLights is created once, so shaders never recompile on reload. */
  readonly interactions: InteractionSystem;
  private roads: THREE.Group | null = null;
  private bridgeColliders: Collider[] = [];
  private spawnPending: { x: number; y: number; z: number } | null = null;
  private history: Snapshot[] = [];
  private pending: { applied: ApplyResult; ops: Op[] } | null = null;
  private working = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly isReady = (x: number, z: number): boolean => this.chunks.isReady(x, z);
  private lookTimer = 0;
  private cineAngle = 0;
  private artStarted = false;
  private backendSeen = false;
  /** A scatter kind switched to its pack model: re-instance live chunks on the next frame (art hot-swap). */
  private artDirty = false;
  /** The playable characters (bundled; B cycles them). */
  readonly characters: CharacterRoster;
  private readonly groundAt = (x: number, z: number): number => this.built?.field.heightAt(x, z) ?? -Infinity;

  private constructor(
    readonly engine: Engine,
    readonly physics: Physics,
    readonly atmosphere: AtmosphereSystem,
    readonly chunks: ChunkManager,
    readonly water: WaterSystem,
    readonly objects: WorldObjects,
    readonly player: Player,
    readonly wildlife: Wildlife,
    readonly models: ModelSource,
    readonly avatar: Avatar,
    readonly grass: GrassSystem,
    readonly postfx: PostFX,
    private readonly scatter: ScatterAssets,
  ) {
    this.interactions = new InteractionSystem(physics, player, engine.scene, {
      heightAt: (x, z) => this.built?.field.heightAt(x, z) ?? 0,
      isReady: this.isReady,
    });
    objects.onReady.push((root, info) => this.interactions.register(root, info));
    objects.onCleared.push(() => this.interactions.clear());
    objects.onLoading.push((e) => this.ui?.notices.loading(e));
    this.characters = new CharacterRoster(avatar);
    void this.characters.start();
  }

  static async create(canvas: HTMLCanvasElement, models: ModelSource = new AssetModelSource()): Promise<App> {
    const engine = new Engine(canvas);
    const physics = await Physics.create();
    // Art is never awaited here (ruling I8): the world starts with procedural shapes and startArt() swaps models in.
    const scatter = new ScatterAssets();
    const grass = new GrassSystem();
    const postfx = new PostFX(engine.renderer, engine.scene, engine.camera);
    engine.postfx = postfx;
    const app = new App(
      engine, physics, new AtmosphereSystem(engine.scene), new ChunkManager(engine.scene, physics, scatter, grass),
      new WaterSystem(engine.scene), new WorldObjects(engine.scene, physics, models), new Player(engine.camera, canvas, physics),
      new Wildlife(engine.scene), models, new Avatar(engine.scene), grass, postfx, scatter,
    );
    engine.onUpdate((dt, t) => app.frame(dt, t));
    engine.start();
    return app;
  }

  get spawning(): boolean { return this.spawnPending !== null; }

  /**
   * Load the CC0 pack art once, concurrently with everything else, and hot-swap it in as each piece arrives (I8).
   * Called when the backend answers health; with an empty library or no backend everything stays procedural.
   */
  startArt(): void {
    if (this.artStarted) return;
    this.artStarted = true;
    void loadArt(this.scatter, this.wildlife, { onScatter: () => { this.artDirty = true; } }).then((r) => {
      console.info(`[art] ${r.loaded.length} pack models in use${r.missing.length ? `; procedural fallback for: ${r.missing.join(', ')}` : ''}`);
    });
  }
  /** True once the backend has answered (a health ping or any world/edit answer that was not offline). */
  get backendOnline(): boolean { return this.backendSeen; }

  /**
   * The backend answered: health at boot, or the first world/edit answer that did not fall back to offline (a backend
   * that wakes after the boot pings gave up). Forgets remembered asset misses and starts the pack art, once (I6).
   */
  backendAnswered(): void {
    if (this.backendSeen) return;
    this.backendSeen = true;
    this.models.reset?.();
    this.startArt();
  }

  /** Bookkeeping for every world/edit answer: tell the player about a rate-limited fallback, note a live backend. */
  private noteAnswer(res: { source: Source; notice?: string }): void {
    if (res.notice) this.ui?.toast(res.notice);
    if (res.source === 'offline') return;
    // A backend that woke after the health pings gave up: correct the "Offline mode" line too.
    if (!this.backendSeen) this.ui?.setHealth(res.source === 'mock' ? 'AI server in mock mode (no API key)' : 'AI online');
    this.backendAnswered();
  }

  /** True while a world is being generated or an edit is being asked for (game keys and new requests wait). */
  get busy(): boolean { return this.working; }

  /** `wait`: places added or changed while playing; they appear when their model arrives (WorldObjects.rebuild). */
  load(recipe: Recipe, keep: Placement[] = [], respawn = true, wait?: ReadonlySet<string>): BuiltWorld {
    const timeChanged = this.built?.recipe.atmosphere.time !== recipe.atmosphere.time;
    const built = buildWorld(recipe, keep);
    this.built = built;
    this.chunks.setSnapshot(snapshotField(built.field));
    this.atmosphere.apply(recipe.atmosphere, respawn || timeChanged);
    this.water.rebuild(built.field);
    this.atmosphere.setSkyTint(recipe.palette?.sky);
    this.grass.setTint(recipe.palette?.ground);
    if (this.roads) { this.engine.scene.remove(this.roads); disposeGroup(this.roads); }
    this.roads = buildRoadMeshes(built.field, built.roads);
    this.engine.scene.add(this.roads);
    removeBridgeColliders(this.bridgeColliders, this.physics);
    this.bridgeColliders = addBridgeColliders(built.field, built.roads, this.physics);
    this.objects.rebuild(built, wait); // clear() → onCleared → interactions.clear(), then onReady → register per object
    this.wildlife.rebuild(built);
    this.ui?.setChecks(built.checks);
    if (respawn) {
      this.spawnPending = built.spawn;
      this.player.enabled = false;
      this.player.teleport(built.spawn.x, built.spawn.y, built.spawn.z);
    }
    return built;
  }

  async generate(prompt: string): Promise<boolean> {
    if (this.working) return false;
    const ui = this.ui;
    this.cancel();
    this.working = true;
    try {
      ui?.setBusy('Imagining your world…');
      const res = await generateWorld(prompt);
      this.noteAnswer(res);
      if (res.type === 'unsupported') { ui?.setBusy(null); ui?.toast(res.reason); return false; }
      ui?.setBusy('Shaping terrain, carving rivers, placing everything…');
      await nextFrame();
      this.models.reset?.(); // a new world may find models that were missing (or offline) before
      const built = this.load(res.recipe);
      for (const line of [...res.notes, ...built.log]) ui?.log(line);
      ui?.setSource(SOURCE_LABEL[res.source]);
      this.history = [];
      const spawned = await waitUntil(() => !this.spawning, {
        failed: () => !!this.spawnPending && this.chunks.failed(this.spawnPending.x, this.spawnPending.z),
        timeoutMs: SPAWN_TIMEOUT_MS,
        frame: nextFrame,
      });
      if (!spawned) {
        ui?.setBusy(null);
        ui?.toast('The terrain could not be loaded — reload or try another world');
        return false;
      }
      ui?.setBusy(null);
      ui?.showStart(false);
      ui?.showHud(true);
      return true;
    } catch (e) {
      console.error('generate failed', e);
      ui?.setBusy(null);
      ui?.toast('Could not build that world. Try describing it differently.');
      return false;
    } finally {
      this.working = false;
    }
  }

  editContext(lookOverride?: { x: number; z: number }): EditContext {
    const b = this.built!;
    let hit: LookHit | null = null;
    if (!lookOverride) {
      const h = this.pick([...this.objects.pickables(), ...this.chunks.meshes()], 400);
      if (h) hit = { x: h.point.x, y: h.point.y, z: h.point.z, placeId: this.objects.infoFor(h.object)?.placeId };
    }
    return makeEditContext({ player: this.player.position, recipe: b.recipe, placements: b.placements, override: lookOverride, hit });
  }

  async command(text: string, lookOverride?: { x: number; z: number }): Promise<void> {
    if (!this.built || this.working) return;
    const ui = this.ui;
    const recipe = this.built.recipe;
    this.working = true;
    ui?.setBusy('Thinking…');
    let res: EditResult;
    try {
      res = await editWorld(recipe, text, this.editContext(lookOverride));
    } catch (e) {
      console.error('command failed', e);
      ui?.toast('Could not work out that change. Try again.');
      return;
    } finally {
      this.working = false;
      ui?.setBusy(null);
    }
    ui?.setSource(SOURCE_LABEL[res.source]);
    this.noteAnswer(res);
    if (res.type === 'unsupported') { ui?.toast(res.notice ? `${res.notice} ${res.reason}` : res.reason); return; }
    if (this.built?.recipe !== recipe) return; // the world changed while we waited
    try {
      this.pending = { applied: applyOps(recipe, res.ops), ops: res.ops };
      ui?.showPreview(describeOps(res.ops), res.notes);
    } catch (e) {
      ui?.toast(e instanceof OpError ? e.message : 'That change could not be applied.');
    }
  }

  confirm(): void {
    const p = this.pending, b = this.built;
    if (!p || !b) return;
    this.pending = null;
    this.ui?.hidePreview();
    const a = p.applied;
    const atmosphereOnly = p.ops.every((o) => o.op === 'setAtmosphere');
    const snap: Snapshot = { recipe: b.recipe, placements: b.placements, atmosphereOnly };
    this.history.push(snap);
    if (this.history.length > MAX_UNDO) this.history.shift();
    if (atmosphereOnly) {
      const timeChanged = p.ops.some((o) => o.op === 'setAtmosphere' && o.time !== undefined);
      b.recipe = a.recipe;
      this.atmosphere.apply(a.recipe.atmosphere, timeChanged);
      this.ui?.toast('Done');
      return;
    }
    try {
      const keep = a.terrainChanged ? [] : b.placements.filter((pl) => !a.changedPlaces.has(pl.id) && !a.removedPlaces.has(pl.id));
      const built = this.load(a.recipe, keep, false, a.changedPlaces);
      const placed = built.placements.filter((pl) => a.changedPlaces.has(pl.id)).map((pl) => `${pl.id}: ${pl.reasons.join(', ')}`);
      this.ui?.toast(placed.length ? `Placed ${placed.join(' · ')}` : 'Done');
    } catch (e) {
      console.error('edit failed to build', e);
      if (this.history[this.history.length - 1] === snap) this.history.pop();
      try { this.load(snap.recipe, snap.placements, false); } catch (e2) { console.error('restore failed', e2); }
      this.ui?.toast('That change could not be built, so the world was left as it was.');
    }
  }

  cancel(): void {
    this.pending = null;
    this.ui?.hidePreview();
  }

  undo(): void {
    const b = this.built;
    const prev = b ? this.history.pop() : undefined;
    if (!b || !prev) { this.ui?.toast('Nothing to undo'); return; }
    try {
      if (prev.atmosphereOnly) {
        const timeChanged = prev.recipe.atmosphere.time !== b.recipe.atmosphere.time;
        b.recipe = prev.recipe;
        this.atmosphere.apply(prev.recipe.atmosphere, timeChanged);
      } else {
        this.load(prev.recipe, prev.placements, false);
      }
      this.ui?.toast('Undone');
    } catch (e) {
      console.error('undo failed', e);
      this.ui?.toast('Undo failed.');
    }
  }

  private get reach(): number { return this.avatar.thirdPerson ? REACH_THIRD : REACH_FIRST; }

  interact(): void {
    const item = this.interactions.nearest(this.player.lookRay(), this.reach);
    if (item) this.interactions.use(item);
  }

  private pick(objects: THREE.Object3D[], far: number): THREE.Intersection | null {
    const ray = this.player.lookRay();
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  private frame(dt: number, t: number): void {
    const focus = this.spawnPending ?? this.cinematic ?? this.player.position;
    this.chunks.update(focus.x, focus.z);
    if (this.spawnPending && this.chunks.isReady(this.spawnPending.x, this.spawnPending.z)) {
      const s = this.spawnPending;
      this.player.spawn(s.x, s.y, s.z);
      this.player.enabled = true;
      this.spawnPending = null;
    }
    if (this.cinematic) {
      const c = this.cinematic;
      this.cineAngle += dt * c.speed;
      this.engine.camera.position.set(c.x + Math.cos(this.cineAngle) * c.radius, c.y + c.height, c.z + Math.sin(this.cineAngle) * c.radius);
      this.engine.camera.lookAt(c.x, c.y + 4, c.z);
    } else if (this.built) {
      this.player.update(dt, this.built.field, this.isReady);
      this.avatar.update(dt, this.engine.camera, this.player.position, this.player.moving, this.player.running, this.groundAt);
    }
    if (this.artDirty) { this.artDirty = false; this.chunks.refreshScatter(); }
    this.physics.step(dt);
    this.atmosphere.update(dt, this.engine.camera.position);
    this.water.update(this.engine.camera.position);
    this.grass.update(t, this.built?.recipe.atmosphere.wind ?? 0.3);
    this.postfx.setNight(this.atmosphere.night);
    this.engine.renderer.toneMappingExposure = 0.9 + 0.3 * this.atmosphere.night; // night floor (DECISIONS 2026-11-02)
    setNightGlow(this.atmosphere.isNight ? 1.4 : 0); // placeholder windows and the windows/lamps of loaded models
    this.interactions.update(dt, this.atmosphere.isNight, t);
    if (this.built) this.wildlife.update(dt, t, this.player.position, this.built.field, this.isReady);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && this.ui && this.built) {
      this.lookTimer = 0.2;
      this.updateLook(this.ui);
    }
  }

  /** Interaction hint (only while walking with the pointer locked) and the place card under the crosshair. */
  private updateLook(ui: UI): void {
    if (this.cinematic || ui.startOpen) { ui.setHint(null); ui.setCard(null); return; }
    const item = this.player.controls.isLocked ? this.interactions.nearest(this.player.lookRay(), this.reach) : null;
    ui.setHint(item ? this.interactions.hint(item) : null);
    const hit = this.pick(this.objects.pickables(), 80);
    ui.setCard(hit ? this.objects.infoFor(hit.object) : null);
  }
}
