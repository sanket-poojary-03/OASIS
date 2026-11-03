import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Physics } from '../../src/physics/physics';
import { Vehicles, type VehicleEnv } from '../../src/logic/vehicles';
import type { Player } from '../../src/player/player';
import type { ObjectInfo } from '../../src/render/worldObjects';

let physics: Physics;
beforeAll(async () => { physics = await Physics.create(); });

/** A 4 m car template (+z forward) with a named front wheel. */
function template(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 4).translate(0, 0.6, 0));
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2).translate(0.8, 0.35, 1.3));
  wheel.name = 'FrontLeftWheel';
  g.add(body, wheel);
  return g;
}

function rig(env: Partial<VehicleEnv> = {}) {
  const R = physics.R;
  const world = physics.world;
  // flat ground at y = 0 for the controller (a thin fixed slab)
  world.createCollider(R.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0));
  const keys = new Set<string>();
  const playerBody = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0));
  const collider = world.createCollider(R.ColliderDesc.capsule(0.55, 0.35), playerBody);
  const teleported: number[][] = [];
  const player = {
    keys, collider, enabled: true, position: new THREE.Vector3(),
    teleport: (x: number, y: number, z: number) => teleported.push([x, y, z]),
  } as unknown as Player;
  const scene = new THREE.Scene();
  const full: VehicleEnv = { heightAt: () => 0, isWater: () => false, isReady: () => true, ...env };
  const v = new Vehicles(scene, physics, player, full, async () => template());
  return { v, scene, player, keys, teleported, camera: new THREE.PerspectiveCamera() };
}

const run = (v: Vehicles, camera: THREE.PerspectiveCamera, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) { v.update(1 / 60, camera); physics.step(1 / 60); }
};

describe('Vehicles', () => {
  it('parks a car near the spawn, gets in with E, drives forward with W, gets out beside it', async () => {
    const { v, scene, player, keys, teleported, camera } = rig();
    await v.parkNear(1000, 1000);
    const car = scene.getObjectByName('parked-car')!;
    expect(car).toBeDefined();
    const start = car.position.clone();
    expect(start.distanceTo(new THREE.Vector3(1000, 0, 1000))).toBeGreaterThan(5);
    const ray = new THREE.Ray(new THREE.Vector3(start.x, 1.6, start.z).addScaledVector(new THREE.Vector3(1, 0, 0), -4), new THREE.Vector3(1, 0, 0));
    const found = v.nearest(ray, 4);
    expect(found).not.toBeNull();
    v.enter(found!);
    expect(player.enabled).toBe(false);
    keys.add('KeyW');
    run(v, camera, 2);
    keys.clear();
    const moved = car.position.distanceTo(start);
    expect(moved).toBeGreaterThan(10);
    expect(v.hint(null)).toMatch(/km\/h/);
    expect(camera.position.distanceTo(car.position)).toBeLessThan(16); // chase camera behind it (it lags a little at speed)
    v.exit();
    expect(player.enabled).toBe(true);
    expect(teleported).toHaveLength(1);
    expect(Math.hypot(teleported[0][0] - car.position.x, teleported[0][2] - car.position.z)).toBeGreaterThan(1.5);
  });

  it('stops at water instead of driving in', async () => {
    const { v, scene, keys, camera } = rig({ isWater: (_x, z) => z > 2020 });
    await v.parkNear(2000, 2000);
    const car = scene.getObjectByName('parked-car')!;
    // point it north (+z) toward the water and drive
    const found = v.nearest(new THREE.Ray(car.position.clone().setY(0.6).add(new THREE.Vector3(0, 0, -6)), new THREE.Vector3(0, 0, 1)), 6)!;
    v.enter(found);
    (found as unknown as { state: { heading: number } }).state.heading = 0;
    keys.add('KeyW');
    run(v, camera, 4);
    expect(car.position.z).toBeLessThan(2020);
  });

  it('a drive place adopts its root; a world edit keeps where it was driven to', async () => {
    const { v, keys, camera } = rig();
    const root = new THREE.Group();
    root.position.set(-1000, 0, -1000);
    root.userData.size = new THREE.Vector3(4, 1.4, 1.8); // long side on x: turned to face along z
    const content = new THREE.Group(); content.name = 'content'; root.add(content);
    const info = { objectId: 'jeep', label: 'Jeep', interaction: 'drive' } as ObjectInfo;
    v.adopt(root, info);
    expect(content.rotation.y).toBeCloseTo(Math.PI / 2);
    const car = v.nearest(new THREE.Ray(new THREE.Vector3(-1000, 0.7, -1005), new THREE.Vector3(0, 0, 1)), 4)!;
    expect(v.hint(car)).toMatch(/drive the jeep/);
    v.enter(car);
    keys.add('KeyW');
    run(v, camera, 1.5);
    const driven = root.position.clone();
    expect(driven.distanceTo(new THREE.Vector3(-1000, 0, -1000))).toBeGreaterThan(3);
    v.dropAdopted(); // an edit rebuilds the world: driver gets out, pose remembered
    expect(v.driving).toBeNull();
    const again = new THREE.Group();
    again.position.set(-1000, 0, -1000);
    again.userData.size = new THREE.Vector3(1.8, 1.4, 4);
    v.adopt(again, info);
    expect(again.position.distanceTo(driven)).toBeLessThan(0.01);
  });
});
