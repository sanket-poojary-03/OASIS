import { ROAD_LIFT } from './render/roads';
import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { briefWorld, editWorld, generateWorld } from './api/client';
import { makeEditContext, type LookHit } from './api/editContext';
import type { EditContext, EditResult, Source, WorldResult } from './api/types';
import { applyOps, describeOps, OpError, type ApplyResult, type Op } from './core/ops';
import type { Recipe } from './core/recipe';
import { InteractionSystem } from './logic/interactions';
import { Wildlife } from './logic/wildlife';
import { Physics } from './physics/physics';
import { Avatar, FEET } from './player/avatar';
import { CharacterRoster } from './player/characters';
import { Booster } from './render/booster';
import { loadCarTemplate } from './render/vehicleModel';
import { Vehicles } from './logic/vehicles';
import { Player } from './player/player';
import { loadArt } from './render/artLoader';
import { AssetModelSource } from './render/assetModels';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { disposeGroup } from './render/dispose';
import { DeckSystem } from './render/decks';
import { Engine } from './render/engine';
import { GrassSystem } from './render/grass';
import { setNightGlow } from './render/nightGlow';
import { PostFX } from './render/postfx';
import { RangeCuller, TERRAIN_RANGE } from './render/rangeCull';
import { addBridgeColliders, buildRoadMeshes, deckSurface, removeBridgeColliders } from './render/roads';
import { ScatterAssets } from './render/scatterAssets';
import { WaterSystem } from './render/water';
import { WorldObjects, type ModelSource } from './render/worldObjects';
import { Underwater } from './render/underwater';
import { insideMap } from './world/mapBounds';
import { NoticeQueue } from './ui/assetNotices';
import { menuShot, type MenuBeat } from './ui/menuFlight';
import { MENU_FOV, MENU_ORBIT_SPEED } from './ui/showcase';
import type { UI } from './ui/ui';
import { waitUntil } from './ui/wait';
import { buildWorld, type BuiltWorld } from './world/build';
import { snapshotField } from './world/field';
import type { Placement } from './world/placement';

/** An orbiting camera (the demo, the start screen). `look`: how high above the centre it aims (default 4 m). */
export interface Cinematic { x: number; y: number; z: number; radius: number; height: number; speed: number; look?: number }
/** One undo step. `atmosphereOnly` steps are undone without a geometry rebuild (spec §7 rebuild rule). */
interface Snapshot { recipe: Recipe; placements: Placement[]; atmosphereOnly: boolean }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Frame time allowed for the spawn chunk to arrive before generate() gives up (a hidden tab does not count). */
const SPAWN_TIMEOUT_MS = 20_000;
const MAX_UNDO = 50;
/** How far the view carries across an ocean (metres); weather still brings the fog closer. */
const OCEAN_VIEW = 700;
/** Interaction reach from the camera: 4 m at the eye, 9 m from the third-person camera 5 m behind. */
const REACH_FIRST = 4, REACH_THIRD = 9;

/** Seconds between reminders, for a player walking along the edge. */
const EDGE_NOTICE_EVERY = 15;
const ROAD_EDGE = 0.4;
/**
 * Where the menu's orbit starts: west of the village, with the afternoon sun behind the camera, so the first thing seen
 * is lit. public/menu-poster.webp is a capture from this angle: retake it if this or the showcase changes.
 */
const MENU_START_ANGLE = Math.PI * 1.1;
/** The live menu takes over from its picture at this, whatever is still loading. */
const MENU_LOADING_LIMIT_MS = 12_000;
const MENU_SHADOWS_EVERY = 6;
/** The view distance follows the menu's camera in steps this big: resetting it re-checks every object in the world. */
const MENU_REACH_STEP = 8;
/** The menu's camera stays at least this far above the ground under it. */
const MENU_CLEARANCE = 16;
/** The player's field of view; the menu's narrower one keeps tall buildings from leaning. */
const PLAY_FOV = 70;

export class App {
  built: BuiltWorld | null = null;
  ui: UI | null = null;
  cinematic: Cinematic | null = null;
  /** Exactly one for the page lifetime: its fixed pool of 6 PointLights is created once, so shaders never recompile on reload. */
  readonly interactions: InteractionSystem;
  private roads: THREE.Group | null = null;
  private readonly culler = new RangeCuller(TERRAIN_RANGE);
  private bridgeColliders: Collider[] = [];
  private deckAt: (x: number, z: number, fromY: number) => number | null = () => null;
  private readonly decks: DeckSystem;
  private readonly underwater: Underwater;
  private spawnPending: { x: number; y: number; z: number; yaw?: number } | null = null;
  private history: Snapshot[] = [];
  private pending: { applied: ApplyResult; ops: Op[] } | null = null;
  private working = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly isReady = (x: number, z: number): boolean => this.chunks.isReady(x, z);
  private lookTimer = 0;
  /** When the player was last told they reached the edge of the map. */
  private edgeToldAt = -EDGE_NOTICE_EVERY;
  private cineAngle = 0;
  /** The start screen's world is turning behind it (showcase); a world the player enters ends it. */
  private menuWorld = false;
  /** Set while the start screen's camera and clock are following the menu's flight (ui/menuFlight). */
  private menuBeats: readonly MenuBeat[] | null = null;
  private menuSpots: ReadonlyMap<string, { x: number; y: number; z: number }> = new Map();
  private menuClock = 0;
  /** The menu's world is still loading its land, behind the picture of it (index.html). */
  private menuLoading = false;
  private menuLoadingSince = 0;
  private menuFrame = 0;
  /** The menu camera's height: eased, so a hill under it does not jolt the view. */
  private cineY = NaN;
  private readonly dayScale: number;
  private artStarted = false;
  private artLoaded = false;
  private backendSeen = false;
  /** A scatter kind switched to its pack model: re-instance live chunks on the next frame (art hot-swap). */
  private artDirty = false;
  /** The playable characters (bundled; B cycles them). */
  readonly characters: CharacterRoster;
  private readonly booster: Booster;
  /** Drivable cars: one parked at every spawn, plus 'drive' places. */
  readonly vehicles: Vehicles;
  private readonly feet = new THREE.Vector3();
  private readonly groundAt = (x: number, z: number): number => this.built?.field.heightAt(x, z) ?? -Infinity;
  /** What feet stand on: a road's surface is above the ground under it. */
  private readonly feetGroundAt = (x: number, z: number): number => {
    const field = this.built?.field;
    // Inward of the edge: a road's ribbon ends square, but its distance test is round past the last point.
    return field ? field.heightAt(x, z) + (field.isOnRoad(x, z, -ROAD_EDGE) ? ROAD_LIFT : 0) : -Infinity;
  };

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
    this.vehicles = new Vehicles(engine.scene, physics, player, {
      // What the tyres touch: a road's surface stands above the ground, and on the bare ground they would sink into it.
      heightAt: (x, z) => {
        const field = this.built?.field;
        return field ? field.heightAt(x, z) + (field.isOnRoad(x, z) ? ROAD_LIFT : 0) : 0;
      },
      deckAt: (x, z, fromY) => this.deckAt(x, z, fromY),
      isOnRoad: (x, z, margin) => this.built?.field.isOnRoad(x, z, margin) ?? false,
      isWater: (x, z) => !insideMap(x, z) || (this.built?.field.isWater(x, z) ?? false), // a car stops at the edge of the map as at a shore
    }, () => loadCarTemplate());
    objects.onReady.push((root, info) => this.interactions.register(root, info));
    objects.onReady.push((root, info) => { if (info.interaction === 'drive') this.vehicles.adopt(root, info); });
    objects.onCleared.push(() => this.interactions.clear());
    objects.onCleared.push(() => this.vehicles.dropAdopted());
    objects.onLoading.push((e) => { if (!this.menuWorld) this.ui?.notices.loading(e); }); // the menu's world loads quietly
    if (models instanceof AssetModelSource) {
      const notices = new NoticeQueue((text) => this.ui?.toast(text));
      models.onNotice = (text) => { if (!this.menuWorld) notices.add(text); };
    }
    this.booster = new Booster(engine.scene);
    avatar.attach(this.booster.pack);
    this.dayScale = atmosphere.timeScale;
    this.decks = new DeckSystem(engine.scene, physics);
    this.underwater = new Underwater(engine.scene);
    wildlife.models = models;
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
      this.artLoaded = true;
      console.info(`[art] ${r.loaded.length} pack models in use${r.missing.length ? `; procedural fallback for: ${r.missing.join(', ')}` : ''}`);
    });
  }
  /** True once the backend has answered (a health ping or any world/edit answer from the LLM). */
  get backendOnline(): boolean { return this.backendSeen; }

  /**
   * The backend answered: health at boot, or the first world/edit answer from the LLM (a backend
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
    if (res.source !== 'live') return;
    // A backend that woke after the health pings gave up: correct the "LLM not available" line too.
    if (!this.backendSeen) this.ui?.setHealth('');
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
    this.decks.rebuild(built.field);
    // Fog and culling end at the loaded terrain so its edge never shows; an open sea has no edge to hide.
    const reach = built.field.deckY === null ? 0 : OCEAN_VIEW - TERRAIN_RANGE;
    this.atmosphere.reach = reach;
    this.culler.setRange(TERRAIN_RANGE + reach);
    this.atmosphere.setSkyTint(recipe.palette?.sky);
    this.grass.setTint(recipe.palette?.ground);
    if (this.roads) { this.engine.scene.remove(this.roads); disposeGroup(this.roads); }
    this.roads = buildRoadMeshes(built.field, built.roads);
    this.engine.scene.add(this.roads);
    // Nothing is drawn past the loaded terrain (it would hang in the sky): roads, water and placed objects.
    this.culler.track(this.roads);
    this.culler.track(this.water.group);
    this.culler.track(this.decks.group);
    this.culler.track(this.objects.group, true);
    removeBridgeColliders(this.bridgeColliders, this.physics);
    this.bridgeColliders = addBridgeColliders(built.field, built.roads, this.physics);
    this.deckAt = deckSurface(built.field, built.roads);
    if (respawn) this.vehicles.reset(); // before objects: a new world's cars never inherit old poses
    // Stand-in shapes only while no server has answered, for a dev preset: the menu's own models ship with the site.
    const standIns = !this.backendSeen && !this.menuWorld;
    this.objects.standIns = standIns;
    if (this.scatter.standIns !== standIns) { this.scatter.standIns = standIns; this.artDirty = true; }
    this.objects.rebuild(built, wait, respawn); // clear() → onCleared → interactions.clear(), then onReady → register per object
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
      ui?.setBusy('thinking');
      const brief = await briefWorld(prompt);
      if (brief.brief) ui?.setBusy('designing');
      const res = await generateWorld(prompt, brief.brief);
      this.noteAnswer(res);
      if (res.type === 'unsupported') { ui?.setBusy(null); ui?.toast(res.reason); return false; }
      return await this.enter(res);
    } catch (e) {
      console.error('generate failed', e);
      ui?.setBusy(null);
      ui?.toast('Could not build that world. Try describing it differently.');
      return false;
    } finally {
      this.working = false;
    }
  }

  /** Dev and screenshot harness (?w=<fixture>): enter a given recipe the way a generated world is entered. */
  async open(recipe: Recipe): Promise<boolean> {
    if (this.working) return false;
    this.cancel();
    this.working = true;
    try {
      return await this.enter({ type: 'recipe', recipe, notes: [], source: 'none' });
    } finally {
      this.working = false;
    }
  }

  /**
   * The start screen's backdrop: `recipe` built like any world, with no player in it, and `beats` moving the camera and
   * the clock through it. Minecraft-style: the menu floats over a living world. Nothing here needs the AI server.
   */
  showcase(recipe: Recipe, beats: readonly MenuBeat[]): void {
    if (this.working || (this.built && !this.menuWorld)) return; // never replaces a world the player is in
    this.menuWorld = true;
    this.menuBeats = beats;
    this.startArt();
    const built = this.load(recipe);
    this.spawnPending = null; // nobody spawns: the camera orbits
    this.player.enabled = false;
    this.menuSpots = new Map(built.placements.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
    this.menuLoading = true;
    this.menuLoadingSince = performance.now();
    this.menuClock = 0;
    this.cineAngle = MENU_START_ANGLE;
    this.cineY = NaN;
    const first = menuShot(beats, this.menuSpots, 0);
    this.cinematic = { ...first, speed: MENU_ORBIT_SPEED };
    this.atmosphere.hours = first.hours;
    this.atmosphere.timeScale = 0;
    this.engine.camera.fov = MENU_FOV;
    this.engine.camera.updateProjectionMatrix();
    this.atmosphere.reach = first.radius;
    this.culler.setRange(TERRAIN_RANGE + first.radius);
  }

  /** One frame of the backdrop. The clock waits for the land, so the live view takes over from the picture at the shot the picture shows. */
  private menuStep(c: Cinematic, dt: number): void {
    // Everything first, so nothing pops in on screen; but a slow connection must not hold the page on a picture for long.
    const complete = this.artLoaded && !this.objects.loading && this.chunks.viewLoaded(c.x, c.z);
    if (this.menuLoading && (complete || performance.now() - this.menuLoadingSince > MENU_LOADING_LIMIT_MS)) {
      this.menuLoading = false;
      this.reveal();
    }
    // The sun moves slowly here and little else casts a moving shadow, so the shadows need not be redrawn every frame.
    const shadows = this.engine.renderer.shadowMap;
    shadows.autoUpdate = false;
    shadows.needsUpdate = this.menuFrame++ % MENU_SHADOWS_EVERY === 0;
    if (!this.menuLoading) {
      this.menuClock += dt;
      this.cineAngle += dt * c.speed;
    }
    const shot = menuShot(this.menuBeats!, this.menuSpots, this.menuClock);
    c.x = shot.x; c.y = shot.y; c.z = shot.z; c.radius = shot.radius; c.height = shot.height; c.look = shot.look;
    this.atmosphere.hours = shot.hours;
    this.atmosphere.setShadowArea(c, shot.shadow);
    // The camera looks across the land loaded around what it circles, so it sees as much farther as it stands back.
    if (Math.abs(this.atmosphere.reach - shot.radius) > MENU_REACH_STEP) {
      this.atmosphere.reach = shot.radius;
      this.culler.setRange(TERRAIN_RANGE + shot.radius);
    }
    // Never through a hill: the ground under the camera lifts it, gently, since a hill is seen coming.
    const ground = this.built?.field.heightAt(c.x + Math.cos(this.cineAngle) * c.radius, c.z + Math.sin(this.cineAngle) * c.radius) ?? -Infinity;
    const wanted = Math.max(c.y + c.height, ground + MENU_CLEARANCE);
    this.cineY = Number.isNaN(this.cineY) ? wanted : this.cineY + (wanted - this.cineY) * Math.min(1, dt * 1.5);
  }

  /** Leave the start screen's backdrop: the camera and the clock are the player's again. */
  private endShowcase(): void {
    if (!this.menuWorld) return;
    this.menuWorld = false;
    this.menuBeats = null;
    this.menuLoading = false;
    this.cinematic = null;
    this.atmosphere.timeScale = this.dayScale;
    this.atmosphere.setShadowArea(null);
    this.engine.renderer.shadowMap.autoUpdate = true;
    this.engine.camera.fov = PLAY_FOV;
    this.engine.camera.updateProjectionMatrix();
  }

  /** Fades the 3D view in over the page's picture of the menu. */
  private reveal(): void {
    this.engine.renderer.domElement.classList.remove('waiting');
  }

  private async enter(res: Extract<WorldResult, { type: 'recipe' }>): Promise<boolean> {
    const ui = this.ui;
    this.endShowcase();
    ui?.setBusy('building');
    // The picture stays until the new world can take over: nobody sees its land streaming in.
    const canvas = this.engine.renderer.domElement;
    if (!canvas.classList.contains('waiting')) { // else the page's picture of the menu is still doing that job
      this.postfx.render();
      ui?.holdFrame(canvas);
    }
    await nextFrame();
    this.models.reset?.(); // a new world may find models that were missing (or unreachable) before
    this.load(res.recipe);
    this.history = [];
    const spawned = await waitUntil(() => !this.spawning, {
      failed: () => !!this.spawnPending && this.chunks.failed(this.spawnPending.x, this.spawnPending.z),
      timeoutMs: SPAWN_TIMEOUT_MS,
      frame: nextFrame,
    });
    this.reveal();
    if (!spawned) {
      ui?.setBusy(null);
      ui?.toast('The terrain could not be loaded — reload or try another world');
      return false;
    }
    ui?.setBusy(null);
    ui?.showStart(false);
    ui?.showHud(true);
    ui?.tutorial.highlight();
    return true;
  }

  editContext(lookOverride?: { x: number; z: number }): EditContext {
    const b = this.built!;
    let hit: LookHit | null = null;
    if (!lookOverride) {
      const h = this.pick([...this.objects.pickables(), ...this.chunks.meshes()], 400);
      // A find out in the open is not a place the AI can name in an edit, so "here" is just its spot.
      const placeId = h ? this.objects.infoFor(h.object)?.placeId : undefined;
      if (h) hit = { x: h.point.x, y: h.point.y, z: h.point.z, placeId: b.recipe.places.some((p) => p.id === placeId) ? placeId : undefined };
    }
    return makeEditContext({ player: this.player.position, recipe: b.recipe, placements: b.placements, override: lookOverride, hit });
  }

  async command(text: string, lookOverride?: { x: number; z: number }): Promise<void> {
    if (!this.built || this.working) return;
    const ui = this.ui;
    const recipe = this.built.recipe;
    this.working = true;
    ui?.setBusy('editing');
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
      const placed = built.placements.filter((pl) => a.changedPlaces.has(pl.id)).map((pl) => `${pl.id}: ${pl.reasons.join(', ')}, ${Math.round(Math.hypot(pl.x - this.player.position.x, pl.z - this.player.position.z))} m away`);
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
    if (this.vehicles.driving) { this.vehicles.exit(); return; }
    const car = this.vehicles.nearest(this.player.lookRay(), this.reach);
    if (car) { this.vehicles.enter(car); return; }
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
      if (s.yaw !== undefined) this.engine.camera.rotation.set(-0.06, s.yaw, 0, 'YXZ'); // facing the place asked for
      this.player.enabled = true;
      this.spawnPending = null;
      if (this.built?.field.deckY === null) void this.vehicles.parkNear(s.x, s.z); // no car on a floating deck
    }
    this.avatar.riding = !!this.vehicles.driving; // also after a world edit put the driver out
    if (this.cinematic) {
      const c = this.cinematic;
      if (this.menuBeats) this.menuStep(c, dt);
      else this.cineAngle += dt * c.speed;
      this.engine.camera.position.set(c.x + Math.cos(this.cineAngle) * c.radius, this.menuBeats ? this.cineY : c.y + c.height, c.z + Math.sin(this.cineAngle) * c.radius);
      this.engine.camera.lookAt(c.x, c.y + (c.look ?? 4), c.z);
    } else if (this.built && this.vehicles.driving) {
      this.vehicles.update(dt, this.engine.camera);
      this.ui?.setFuel(this.player.jetpack.fuel, false);
    } else if (this.built) {
      this.player.update(dt, this.built.field, this.isReady);
      this.avatar.update(dt, this.engine.camera, this.player.position, { dir: this.player.move, speed: this.player.speed, running: this.player.running, airborne: this.player.airborne }, this.feetGroundAt);
      const jet = this.player.jetpack;
      this.booster.update(dt, t, jet.firing, this.feet.copy(this.player.position).setY(this.player.position.y - FEET));
      this.ui?.setFuel(jet.fuel, jet.firing);
    }
    // While the menu's world is out of sight its art is applied once, when all of it is here, not once per model.
    if (this.artDirty && (!this.menuLoading || this.artLoaded)) { this.artDirty = false; this.chunks.refreshScatter(); }
    this.physics.step(dt);
    this.atmosphere.update(dt, this.engine.camera.position);
    const under = this.underwater.update(dt, this.built?.field, this.engine.camera.position, this.engine.scene.fog as THREE.Fog, this.atmosphere.night);
    this.water.setUnderwater(under, this.engine.camera.position);
    this.atmosphere.setPrecipVisible(!under);
    this.water.update(this.engine.camera.position, t, this.atmosphere);
    this.culler.update(dt, this.engine.camera.position);
    this.grass.update(t, this.built?.recipe.atmosphere.wind ?? 0.3);
    this.postfx.setNight(this.atmosphere.night);
    this.engine.renderer.toneMappingExposure = 0.9 + 0.3 * this.atmosphere.night; // night floor (DECISIONS 2026-11-02)
    setNightGlow(1.4 * THREE.MathUtils.smoothstep(this.atmosphere.night, 0.45, 0.9)); // placeholder windows and the windows/lamps of loaded models: they come on as the light goes
    this.interactions.update(dt, this.atmosphere.isNight, t);
    if (this.built) this.wildlife.update(dt, t, this.player.position, this.built.field, this.isReady);
    if (this.player.atEdge && !this.menuWorld && t - this.edgeToldAt > EDGE_NOTICE_EVERY) {
      this.edgeToldAt = t;
      this.ui?.toast('This is the edge of the map');
    }
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && this.ui && this.built) {
      this.lookTimer = 0.2;
      this.updateLook(this.ui);
    }
  }

  /** Interaction hint (only while walking with the pointer locked) and the place card under the crosshair. */
  private updateLook(ui: UI): void {
    if (this.cinematic || ui.startOpen) { ui.setHint(null); ui.setCard(null); return; }
    const locked = this.player.controls.isLocked;
    if (this.vehicles.driving) ui.setHint(locked ? this.vehicles.hint(null) : null);
    else {
      const car = locked ? this.vehicles.nearest(this.player.lookRay(), this.reach) : null;
      const item = locked && !car ? this.interactions.nearest(this.player.lookRay(), this.reach) : null;
      ui.setHint(car ? this.vehicles.hint(car) : item ? this.interactions.hint(item) : null);
    }
    const hit = this.pick(this.objects.pickables(), 80);
    ui.setCard(hit ? this.objects.infoFor(hit.object) : null);
  }
}
