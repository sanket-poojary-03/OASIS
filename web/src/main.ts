import './styles.css';
import { recipeSchema } from './core/recipe';
import { Physics } from './physics/physics';
import { Player } from './player/player';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { addBridgeColliders, buildRoadMeshes } from './render/roads';
import { WaterSystem } from './render/water';
import { ScatterAssets } from './render/scatterAssets';
import { buildWorld } from './world/build';
import { snapshotField } from './world/field';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  const recipe = recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]);
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const engine = new Engine(canvas);
  const physics = await Physics.create();
  const atmo = new AtmosphereSystem(engine.scene);
  const chunks = new ChunkManager(engine.scene, physics, new ScatterAssets());
  const player = new Player(engine.camera, canvas, physics);
  const world = buildWorld(recipe);
  atmo.apply(recipe.atmosphere);
  chunks.setSnapshot(snapshotField(world.field));
  const water = new WaterSystem(engine.scene);
  water.rebuild(world.field);
  engine.scene.add(buildRoadMeshes(world.field, world.roads));
  const bridgeColliders = addBridgeColliders(world.field, world.roads, physics); // pass to removeBridgeColliders on world rebuild
  void bridgeColliders;
  player.teleport(world.spawn.x, world.spawn.y, world.spawn.z);
  let pending = true;
  canvas.addEventListener('click', () => player.controls.lock());
  engine.onUpdate((dt) => {
    const p = pending ? world.spawn : player.position;
    chunks.update(p.x, p.z);
    if (pending && chunks.isReady(world.spawn.x, world.spawn.z)) {
      player.spawn(world.spawn.x, world.spawn.y, world.spawn.z);
      player.enabled = true;
      pending = false;
    }
    player.update(dt, world.field, (x, z) => chunks.isReady(x, z));
    physics.step(dt);
    atmo.update(dt, engine.camera.position);
    water.update(engine.camera.position);
  });
  engine.start();
})();
