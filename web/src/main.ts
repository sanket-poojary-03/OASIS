import './styles.css';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { recipeSchema } from './core/recipe';
import { Physics } from './physics/physics';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { ScatterAssets } from './render/scatterAssets';
import { buildWorld } from './world/build';
import { snapshotField } from './world/field';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  const recipe = recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]);
  const engine = new Engine(document.querySelector<HTMLCanvasElement>('#view')!);
  const physics = await Physics.create();
  const atmo = new AtmosphereSystem(engine.scene);
  const chunks = new ChunkManager(engine.scene, physics, new ScatterAssets());
  const world = buildWorld(recipe);
  console.log(world.log.join('\n'));
  atmo.apply({ ...recipe.atmosphere, time: 'day' });
  chunks.setSnapshot(snapshotField(world.field));
  const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
  engine.camera.position.set(world.spawn.x + 60, world.spawn.y + 60, world.spawn.z + 60);
  controls.target.set(world.spawn.x, world.spawn.y, world.spawn.z);
  engine.onUpdate((dt) => {
    controls.update();
    chunks.update(controls.target.x, controls.target.z);
    atmo.update(dt, engine.camera.position);
  });
  engine.start();
})();
