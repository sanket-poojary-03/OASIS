import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Avatar } from '../../src/player/avatar';
import { fakeTemplate } from '../render/rigFixture';

const rig = () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 10.75, 0);
  camera.lookAt(0, 10.75, -10); // facing north (-z), level
  return { scene, camera, avatar: new Avatar(scene) };
};
const still = { dir: new THREE.Vector3(), speed: 0, running: false, airborne: false };
const walking = (x: number, z: number) => ({ dir: new THREE.Vector3(x, 0, z), speed: 3.5, running: false, airborne: false });
const figure = (scene: THREE.Scene) => scene.children.filter((c) => c instanceof THREE.Group);

describe('Avatar', () => {
  it('starts as a hidden procedural figure; first person leaves the camera at the eye', () => {
    const { scene, camera, avatar } = rig();
    expect(figure(scene)).toHaveLength(1);
    expect(figure(scene)[0].visible).toBe(false);
    expect(avatar.hasModel).toBe(false);
    avatar.update(0.016, camera, new THREE.Vector3(0, 10, 0), walking(0, -1));
    expect(camera.position.toArray()).toEqual([0, 10.75, 0]);
  });

  it('V: third person puts the camera close behind and above the ground; V again goes back', () => {
    const { scene, camera, avatar } = rig();
    expect(avatar.toggle()).toBe(true);
    expect(figure(scene)[0].visible).toBe(true);
    avatar.update(0.016, camera, new THREE.Vector3(0, 10, 0), still, () => 0);
    expect(camera.position.z).toBeCloseTo(3.2, 5); // behind = south (+z) when facing north
    expect(camera.position.y).toBeCloseTo(10.95, 5);
    avatar.update(0.016, camera, new THREE.Vector3(0, 10, 0), still, () => 30); // hillside behind the player
    expect(camera.position.y).toBeCloseTo(30.5, 5);
    expect(figure(scene)[0].position.y).toBeCloseTo(9.08, 5); // feet = capsule centre - 0.92 (incl. the controller skin)
    expect(avatar.toggle()).toBe(false);
    expect(figure(scene)[0].visible).toBe(false);
  });

  it('faces the way it walks, whichever way the camera looks', () => {
    const { scene, camera, avatar } = rig();
    avatar.toggle();
    const yaw = () => figure(scene)[0].rotation.y;
    for (let i = 0; i < 60; i++) avatar.update(0.05, camera, new THREE.Vector3(0, 10, 0), walking(-1, 0)); // A, looking north
    expect(yaw()).toBeCloseTo(-Math.PI / 2, 3);
    for (let i = 0; i < 60; i++) avatar.update(0.05, camera, new THREE.Vector3(0, 10, 0), walking(1, 0)); // D
    expect(yaw()).toBeCloseTo(Math.PI / 2, 3);
    camera.position.set(0, 10.75, 0);
    camera.lookAt(0, 10.75, -10);
    for (let i = 0; i < 60; i++) avatar.update(0.05, camera, new THREE.Vector3(0, 10, 0), still);
    expect(yaw()).toBeCloseTo(Math.PI / 2, 3); // standing still keeps the last heading
  });

  it('stands on the ground on a slope, where the capsule rides high; in the air it follows the capsule', () => {
    const { scene, camera, avatar } = rig();
    avatar.toggle();
    const feet = () => figure(scene)[0].position.y;
    for (let i = 0; i < 40; i++) avatar.update(0.05, camera, new THREE.Vector3(0, 10, 0), still, () => 8.85);
    expect(feet()).toBeCloseTo(8.85, 2); // capsule says 9.08, the ground is lower
    for (let i = 0; i < 40; i++) avatar.update(0.05, camera, new THREE.Vector3(0, 10, 0), { ...still, airborne: true }, () => 8.85);
    expect(feet()).toBeCloseTo(9.08, 2);
  });

  it('use() swaps in the animated model, keeping the view mode', () => {
    const { scene, avatar } = rig();
    avatar.toggle();
    avatar.use(fakeTemplate(1.8));
    expect(avatar.hasModel).toBe(true);
    expect(figure(scene)).toHaveLength(1);
    expect(figure(scene)[0].visible).toBe(true);
  });

  it('worn gear (the booster) moves onto every new character', () => {
    const { avatar } = rig();
    const pack = new THREE.Group();
    avatar.attach(pack);
    const first = pack.parent;
    avatar.use(fakeTemplate(1.8));
    expect(pack.parent).not.toBe(first);
    expect(pack.parent?.parent).not.toBeNull(); // on the new model's root, which is in the scene
  });
});
