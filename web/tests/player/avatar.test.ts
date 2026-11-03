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
const figure = (scene: THREE.Scene) => scene.children.filter((c) => c instanceof THREE.Group);

describe('Avatar', () => {
  it('starts as a hidden procedural figure; first person leaves the camera at the eye', () => {
    const { scene, camera, avatar } = rig();
    expect(figure(scene)).toHaveLength(1);
    expect(figure(scene)[0].visible).toBe(false);
    expect(avatar.hasModel).toBe(false);
    avatar.update(0.016, camera, new THREE.Vector3(0, 10, 0), true, false);
    expect(camera.position.toArray()).toEqual([0, 10.75, 0]);
  });

  it('V: third person puts the camera 5 m behind and above the ground; V again goes back', () => {
    const { scene, camera, avatar } = rig();
    expect(avatar.toggle()).toBe(true);
    expect(figure(scene)[0].visible).toBe(true);
    avatar.update(0.016, camera, new THREE.Vector3(0, 10, 0), false, false, () => 0);
    expect(camera.position.z).toBeCloseTo(5, 5); // behind = south (+z) when facing north
    expect(camera.position.y).toBeCloseTo(11.6, 5);
    avatar.update(0.016, camera, new THREE.Vector3(0, 10, 0), false, false, () => 30); // hillside behind the player
    expect(camera.position.y).toBeCloseTo(30.5, 5);
    expect(figure(scene)[0].position.y).toBeCloseTo(9.1, 5); // feet = capsule centre - 0.9
    expect(avatar.toggle()).toBe(false);
    expect(figure(scene)[0].visible).toBe(false);
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
