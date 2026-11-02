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
import { Player } from './player/player';
import { AssetModelSource } from './render/assetModels';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { disposeGroup } from './render/dispose';
import { Engine } from './render/engine';
import { WINDOW_MATERIAL } from './render/placeholders';
import { addBridgeColliders, buildRoadMeshes, removeBridgeColliders } from './render/roads';
import { ScatterAssets } from './render/scatterAssets';
import { WaterSystem } from './render/water';
import { WorldObjects, type ModelSource } from './render/worldObjects';
import type { UI } from './ui/ui';
import { buildWorld, type BuiltWorld } from './world/build';
import { snapshotField } from './world/field';
import type { Placement } from './world/placement';

export interface Cinematic { x: number; y: number; z: number; radius: number; height: number; speed: number }
/** One undo step. `atmosphereOnly` steps are undone without a geometry rebuild (spec §7 rebuild rule). */
interface Snapshot { recipe: Recipe; placements: Placement[]; atmosphereOnly: boolean }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
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

  private constructor(
    readonly engine: Engine,
    readonly physics: Physics,
    readonly atmosphere: AtmosphereSystem,
    readonly chunks: ChunkManager,
    readonly water: WaterSystem,
    readonly objects: WorldObjects,
    readonly player: Player,
    readonly wildlife: Wildlife,
  ) {
    this.interactions = new InteractionSystem(physics, player, engine.scene, {
      heightAt: (x, z) => this.built?.field.heightAt(x, z) ?? 0,
      isReady: this.isReady,
    });
    objects.onReady.push((root, info) => this.interactions.register(root, info));
    objects.onCleared.push(() => this.interactions.clear());
  }

  static async create(canvas: HTMLCanvasElement, models: ModelSource = new AssetModelSource()): Promise<App> {
    const engine = new Engine(canvas);
    const physics = await Physics.create();
    const app = new App(
      engine, physics, new AtmosphereSystem(engine.scene), new ChunkManager(engine.scene, physics, new ScatterAssets()),
      new WaterSystem(engine.scene), new WorldObjects(engine.scene, physics, models), new Player(engine.camera, canvas, physics),
      new Wildlife(engine.scene),
    );
    engine.onUpdate((dt, t) => app.frame(dt, t));
    engine.start();
    return app;
  }

  get spawning(): boolean { return this.spawnPending !== null; }
  /** True while a world is being generated or an edit is being asked for (game keys and new requests wait). */
  get busy(): boolean { return this.working; }

  load(recipe: Recipe, keep: Placement[] = [], respawn = true): BuiltWorld {
    const timeChanged = this.built?.recipe.atmosphere.time !== recipe.atmosphere.time;
    const built = buildWorld(recipe, keep);
    this.built = built;
    this.chunks.setSnapshot(snapshotField(built.field));
    this.atmosphere.apply(recipe.atmosphere, respawn || timeChanged);
    this.water.rebuild(built.field);
    if (this.roads) { this.engine.scene.remove(this.roads); disposeGroup(this.roads); }
    this.roads = buildRoadMeshes(built.field, built.roads);
    this.engine.scene.add(this.roads);
    removeBridgeColliders(this.bridgeColliders, this.physics);
    this.bridgeColliders = addBridgeColliders(built.field, built.roads, this.physics);
    this.objects.rebuild(built); // clear() → onCleared → interactions.clear(), then onReady → register per object
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
      if (res.type === 'unsupported') { ui?.setBusy(null); ui?.toast(res.reason); return false; }
      ui?.setBusy('Shaping terrain, carving rivers, placing everything…');
      await nextFrame();
      const built = this.load(res.recipe);
      for (const line of [...res.notes, ...built.log]) ui?.log(line);
      ui?.setSource(SOURCE_LABEL[res.source]);
      this.history = [];
      while (this.spawning) await nextFrame();
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
    } finally {
      this.working = false;
      ui?.setBusy(null);
    }
    ui?.setSource(SOURCE_LABEL[res.source]);
    if (res.type === 'unsupported') { ui?.toast(res.reason); return; }
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
    this.history.push({ recipe: b.recipe, placements: b.placements, atmosphereOnly });
    if (atmosphereOnly) {
      const timeChanged = p.ops.some((o) => o.op === 'setAtmosphere' && o.time !== undefined);
      b.recipe = a.recipe;
      this.atmosphere.apply(a.recipe.atmosphere, timeChanged);
      this.ui?.toast('Done');
      return;
    }
    const keep = a.terrainChanged ? [] : b.placements.filter((pl) => !a.changedPlaces.has(pl.id) && !a.removedPlaces.has(pl.id));
    const built = this.load(a.recipe, keep, false);
    const placed = built.placements.filter((pl) => a.changedPlaces.has(pl.id)).map((pl) => `${pl.id}: ${pl.reasons.join(', ')}`);
    this.ui?.toast(placed.length ? `Placed ${placed.join(' · ')}` : 'Done');
  }

  cancel(): void {
    this.pending = null;
    this.ui?.hidePreview();
  }

  undo(): void {
    const b = this.built;
    const prev = b ? this.history.pop() : undefined;
    if (!b || !prev) { this.ui?.toast('Nothing to undo'); return; }
    if (prev.atmosphereOnly) {
      const timeChanged = prev.recipe.atmosphere.time !== b.recipe.atmosphere.time;
      b.recipe = prev.recipe;
      this.atmosphere.apply(prev.recipe.atmosphere, timeChanged);
    } else {
      this.load(prev.recipe, prev.placements, false);
    }
    this.ui?.toast('Undone');
  }

  interact(): void {
    const item = this.interactions.nearest(this.player.lookRay());
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
    }
    this.physics.step(dt);
    this.atmosphere.update(dt, this.engine.camera.position);
    this.water.update(this.engine.camera.position);
    WINDOW_MATERIAL.emissiveIntensity = this.atmosphere.isNight ? 1.4 : 0;
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
    if (this.cinematic) { ui.setHint(null); ui.setCard(null); return; }
    const item = this.player.controls.isLocked ? this.interactions.nearest(this.player.lookRay()) : null;
    ui.setHint(item ? this.interactions.hint(item) : null);
    const hit = this.pick(this.objects.pickables(), 80);
    ui.setCard(hit ? this.objects.infoFor(hit.object) : null);
  }
}
