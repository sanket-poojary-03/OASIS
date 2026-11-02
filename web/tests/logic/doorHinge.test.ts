import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findDoorNode, hingeDoor } from '../../src/logic/doorHinge';
import { InteractionSystem } from '../../src/logic/interactions';
import type { ObjectInfo } from '../../src/render/worldObjects';

const box = (name: string, w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  m.name = name;
  m.position.set(x, y, z);
  return m;
};

/** A loaded house model: walls plus (optionally) a separate door part on the front (+z) face. */
function house(withDoor: boolean): THREE.Group {
  const content = new THREE.Group();
  content.name = 'content';
  const model = new THREE.Group();
  model.add(box('Walls', 6, 4, 6, 0, 2, 0));
  model.add(box('DoorFrame', 1.4, 2.4, 0.2, 0, 1.2, 3.05));
  if (withDoor) model.add(box('Door_Front', 1, 2, 0.1, 0.5, 1, 3.1));
  content.add(model);
  return content;
}

function placeholder(): THREE.Group {
  const content = new THREE.Group();
  content.name = 'content';
  const g = new THREE.Group();
  g.userData.placeholder = true;
  g.add(box('ph', 4, 3, 4, 0, 1.5, 0));
  content.add(g);
  return content;
}

function root(content: THREE.Group): THREE.Group {
  const r = new THREE.Group();
  r.position.set(10, 0, 20);
  r.add(content);
  r.updateMatrixWorld(true);
  r.userData.size = new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3());
  return r;
}

function swap(r: THREE.Group, content: THREE.Group): void {
  const old = r.getObjectByName('content');
  if (old) r.remove(old);
  r.add(content);
  r.updateMatrixWorld(true);
  r.userData.size = new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3());
}

const info = (): ObjectInfo => ({ placeId: 'h', objectId: 'h', label: 'House', reasons: [], warnings: [], source: 'placeholder', interaction: 'door', kind: 'building' } as unknown as ObjectInfo);
const system = (): InteractionSystem => new InteractionSystem(
  { addDynamicBox: () => ({}), removeBody: () => {} } as never, {} as never, new THREE.Scene(), { heightAt: () => 0, isReady: () => true },
);
const items = (s: InteractionSystem): Array<{ root: THREE.Object3D; pivot?: THREE.Object3D }> => (s as unknown as { items: Array<{ root: THREE.Object3D; pivot?: THREE.Object3D }> }).items;

describe('door parts in loaded models', () => {
  it('finds a part named like a door, never the frame or doorway', () => {
    expect(findDoorNode(house(true))?.name).toBe('Door_Front');
    expect(findDoorNode(house(false))).toBeNull();
  });

  it('hinges the door on its edge without moving it', () => {
    const r = root(house(true));
    const door = r.getObjectByName('Door_Front')!;
    const before = new THREE.Box3().setFromObject(door);
    const pivot = hingeDoor(r, door);
    r.updateMatrixWorld(true);
    expect(door.parent).toBe(pivot);
    const after = new THREE.Box3().setFromObject(door);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(pivot.position.x).toBeCloseTo(0); // hinge on the door's left edge (root-local x 0..1)
    pivot.rotation.y = -1.6;
    r.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(door).max.z).toBeGreaterThan(before.max.z + 0.5); // swung out
  });
});

describe('interactions follow the model swap', () => {
  it('a placeholder gets the stand-in door; a model with a door part swings its own door', () => {
    const s = system();
    const r = root(placeholder());
    s.register(r, info());
    expect(items(s)).toHaveLength(1);
    expect(r.getObjectByName('stand-in-door')).toBeDefined();
    swap(r, house(true));
    s.register(r, info());
    expect(items(s)).toHaveLength(1);
    expect(r.getObjectByName('stand-in-door')).toBeUndefined();
    expect(items(s)[0].pivot?.children[0]?.name).toBe('Door_Front');
  });

  it('a model without a door part has no door and no floating slab', () => {
    const s = system();
    const r = root(placeholder());
    s.register(r, info());
    swap(r, house(false));
    s.register(r, info());
    expect(items(s)).toHaveLength(0);
    expect(r.getObjectByName('stand-in-door')).toBeUndefined();
  });
});
