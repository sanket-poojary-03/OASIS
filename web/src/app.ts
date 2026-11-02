import type * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Recipe } from './core/recipe';
import { Physics } from './physics/physics';
import { Player } from './player/player';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { WINDOW_MATERIAL } from './render/placeholders';
import { addBridgeColliders, buildRoadMeshes, removeBridgeColliders } from './render/roads';
import { ScatterAssets } from './render/scatterAssets';
import { disposeGroup, WaterSystem } from './render/water';
import { NullModelSource, WorldObjects, type ModelSource } from './render/worldObjects';
import { buildWorld, type BuiltWorld } from './world/build';
import { snapshotField } from './world/field';
import type { Placement } from './world/placement';

export class App {
  built: BuiltWorld | null = null;
  private roads: THREE.Group | null = null;
  private bridgeColliders: Collider[] = [];
  private spawnPending: { x: number; y: number; z: number } | null = null;

  private constructor(
    readonly engine: Engine,
    readonly physics: Physics,
    readonly atmosphere: AtmosphereSystem,
    readonly chunks: ChunkManager,
    readonly water: WaterSystem,
    readonly objects: WorldObjects,
    readonly player: Player,
  ) {}

  static async create(canvas: HTMLCanvasElement, models: ModelSource = new NullModelSource()): Promise<App> {
    const engine = new Engine(canvas);
    const physics = await Physics.create();
    const app = new App(
      engine, physics, new AtmosphereSystem(engine.scene), new ChunkManager(engine.scene, physics, new ScatterAssets()),
      new WaterSystem(engine.scene), new WorldObjects(engine.scene, physics, models), new Player(engine.camera, canvas, physics),
    );
    engine.onUpdate((dt) => app.frame(dt));
    engine.start();
    return app;
  }

  get spawning(): boolean {
    return this.spawnPending !== null;
  }

  load(recipe: Recipe, keep: Placement[] = [], respawn = true): BuiltWorld {
    const built = buildWorld(recipe, keep);
    this.built = built;
    this.chunks.setSnapshot(snapshotField(built.field));
    this.atmosphere.apply(recipe.atmosphere, respawn);
    this.water.rebuild(built.field);
    if (this.roads) { this.engine.scene.remove(this.roads); disposeGroup(this.roads); }
    this.roads = buildRoadMeshes(built.field, built.roads);
    this.engine.scene.add(this.roads);
    removeBridgeColliders(this.bridgeColliders, this.physics);
    this.bridgeColliders = addBridgeColliders(built.field, built.roads, this.physics);
    this.objects.rebuild(built);
    if (respawn) {
      this.spawnPending = built.spawn;
      this.player.enabled = false;
      this.player.teleport(built.spawn.x, built.spawn.y, built.spawn.z);
    }
    return built;
  }

  private frame(dt: number): void {
    const focus = this.spawnPending ?? this.player.position;
    this.chunks.update(focus.x, focus.z);
    if (this.spawnPending && this.chunks.isReady(this.spawnPending.x, this.spawnPending.z)) {
      const s = this.spawnPending;
      this.player.spawn(s.x, s.y, s.z);
      this.player.enabled = true;
      this.spawnPending = null;
    }
    if (this.built) this.player.update(dt, this.built.field, (x, z) => this.chunks.isReady(x, z));
    this.physics.step(dt);
    this.atmosphere.update(dt, this.engine.camera.position);
    this.water.update(this.engine.camera.position);
    WINDOW_MATERIAL.emissiveIntensity = this.atmosphere.isNight ? 1.4 : 0;
  }
}
