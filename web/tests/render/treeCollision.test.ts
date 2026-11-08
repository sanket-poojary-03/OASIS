import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { Physics } from '../../src/physics/physics';
import { fitToHeight } from '../../src/render/fit';
import { surfaceOf } from '../../src/render/meshCollider';
import { ScatterAssets } from '../../src/render/scatterAssets';
import type { ScatterItem } from '../../src/world/scatter';
import { trunkColliders } from '../../src/world/trunks';

/**
 * Every tree in the CC0 library, walked into by a capsule like the player's (same controller settings) and driven into
 * by a car, from 8 sides:
 * as forest scatter (ScatterAssets + trunkColliders) and as a giant placed object (worldObjects' trimesh). Measured
 * before the fix: 18 of 34 models let you walk through their scatter trunk, which stood in the model's middle while the
 * drawn trunk was up to 1.7 m away.
 */
const LIB = resolve(__dirname, '../../../backend/assets/library/quaternius/nature');
const TREES = readdirSync(LIB).flatMap((d) => readdirSync(join(LIB, d)).filter((f) => /tree|pine|palm|willow|birch/i.test(f) && !/stump/i.test(f) && f.endsWith('.glb')).map((f) => `${d}/${f}`));

(globalThis as { self?: unknown }).self ??= globalThis; // GLTFLoader reads `self` (a browser global)
async function load(file: string): Promise<THREE.Object3D> {
  const b = readFileSync(join(LIB, file));
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
}

/** Where the drawn trunk is at the player's height, in the space `obj` is drawn in (its middle and its half-width). */
function drawnTrunk(obj: THREE.Object3D, groundY: number): { x: number; z: number; half: number } | null {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3(), at: THREE.Vector3[] = [];
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y >= groundY + 0.6 && v.y <= groundY + 1.4) { box.expandByPoint(v); at.push(v.clone()); }
    }
  });
  if (box.isEmpty()) return null;
  const x = (box.min.x + box.max.x) / 2, z = (box.min.z + box.max.z) / 2;
  // A hollow shape (the alien blob trees: lobes 5-8 m out, nothing in the middle) has no trunk there to walk into.
  if (!at.some((p) => Math.hypot(p.x - x, p.z - z) < TRUNK_NEAR)) return null;
  return { x, z, half: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 };
}
/** Something must be drawn this close to the middle at the player's height for it to count as a trunk. */
const TRUNK_NEAR = 1.5;

let physics: Physics;
beforeAll(async () => { physics = await Physics.create(); });

/** How many of 8 walks at (cx, cz) reached its middle: walked through instead of stopping at the bark. */
function walksThrough(cx: number, cz: number, groundY: number, start: number): number {
  const R = physics.R, w = physics.world;
  const ground = w.createCollider(R.ColliderDesc.cuboid(200, 1, 200).setTranslation(cx, groundY - 1, cz));
  let through = 0;
  for (let k = 0; k < 8; k++) {
    const dx = Math.cos((k / 8) * Math.PI * 2), dz = Math.sin((k / 8) * Math.PI * 2);
    const body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(cx - dx * start, groundY + 0.95, cz - dz * start));
    const capsule = w.createCollider(R.ColliderDesc.capsule(0.62, 0.28), body);
    const kcc = w.createCharacterController(0.02);
    kcc.enableAutostep(0.6, 0.2, true);
    kcc.enableSnapToGround(0.6);
    kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    w.step();
    let closest = Infinity;
    for (let f = 0; f < Math.ceil(((start + 2) / 5) * 60); f++) { // walking pace, 5 m/s, until 2 m past the middle
      const t = body.translation();
      kcc.computeColliderMovement(capsule, { x: (dx * 5) / 60, y: -1 / 60, z: (dz * 5) / 60 });
      const m = kcc.computedMovement();
      body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
      w.step();
      const p = body.translation();
      closest = Math.min(closest, Math.hypot(p.x - cx, p.z - cz));
    }
    if (closest < 0.1) through++;
    w.removeCharacterController(kcc);
    w.removeRigidBody(body);
  }
  w.removeCollider(ground, false);
  return through;
}

/**
 * How many of 8 drives at (cx, cz) reached its middle. As logic/vehicles moves a car: a kinematic cuboid at LIFT above
 * the ground, horizontal moves through a character controller (offset 0.05), here at boost speed (46 m/s), where a
 * thin trunk is easiest to skip over in one frame.
 */
function drivesThrough(cx: number, cz: number, groundY: number, start: number): number {
  const R = physics.R, w = physics.world, half = { x: 1, y: 0.7, z: 2.1 }, speed = 46;
  let through = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a); // heading a: the car faces +z turned by a
    const body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(cx - dx * start, groundY + 0.35 + half.y, cz - dz * start)
      .setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }));
    const car = w.createCollider(R.ColliderDesc.cuboid(half.x, half.y, half.z), body);
    const kcc = w.createCharacterController(0.05);
    w.step();
    let closest = Infinity;
    for (let f = 0; f < Math.ceil(((start + 3) / speed) * 60); f++) {
      const t = body.translation();
      kcc.computeColliderMovement(car, { x: (dx * speed) / 60, y: 0, z: (dz * speed) / 60 });
      const m = kcc.computedMovement();
      body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y, z: t.z + m.z });
      w.step();
      const p = body.translation();
      closest = Math.min(closest, Math.hypot(p.x - cx, p.z - cz));
    }
    if (closest < 0.1) through++;
    w.removeCharacterController(kcc);
    w.removeRigidBody(body);
  }
  return through;
}

describe('every library tree is solid', () => {
  it('finds the library trees', () => expect(TREES.length).toBeGreaterThan(20));

  it.each(TREES.map((f, i) => [f, i] as const))('%s: as forest scatter, turned and scaled', async (file, i) => {
    const height = 7, assets = new ScatterAssets();
    const drawn = await load(file);
    assets.useModel('pine', drawn, height); // fits it in place, as drawn
    const it: ScatterItem = { kind: 'pine', x: 50, y: 3, z: -20, rotation: (i * 1.7) % (Math.PI * 2), scale: 1.2, variant: 0 };
    const placed = new THREE.Group();
    placed.add(drawn);
    placed.position.set(it.x, it.y, it.z);
    placed.rotation.y = it.rotation;
    placed.scale.setScalar(it.scale);
    const trunk = drawnTrunk(placed, it.y);
    if (!trunk) return; // no trunk within reach to walk into (a floating or hollow tree)
    const made = trunkColliders([it], () => height, (item) => assets.trunkShape(item, height)).map((t) => physics.addFixedCylinder(t.x, t.y, t.z, t.halfHeight, t.radius));
    expect(made).toHaveLength(1);
    expect(walksThrough(trunk.x, trunk.z, it.y, trunk.half + 3)).toBe(0);
    expect(drivesThrough(trunk.x, trunk.z, it.y, trunk.half + 5)).toBe(0);
    for (const c of made) physics.removeCollider(c);
  });

  it.each(TREES)('%s: as a giant placed object (20 m)', async (file) => {
    const root = new THREE.Group();
    root.position.set(-80, 2, 40);
    root.rotation.y = 0.6;
    const content = fitToHeight(await load(file), 20);
    root.add(content);
    const trunk = drawnTrunk(root, 2);
    if (!trunk) return;
    const surface = surfaceOf(root)!;
    const collider = physics.addFixedTrimesh(surface.positions, surface.indices);
    expect(walksThrough(trunk.x, trunk.z, 2, trunk.half + 3)).toBe(0);
    expect(drivesThrough(trunk.x, trunk.z, 2, trunk.half + 5)).toBe(0);
    physics.removeCollider(collider);
  });
});
