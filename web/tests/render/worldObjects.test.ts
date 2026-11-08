import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Physics } from '../../src/physics/physics';
import { WorldObjects, type ModelSource } from '../../src/render/worldObjects';
import type { BuiltWorld } from '../../src/world/build';
import { renderedBox, skinnedTemplate } from './rigFixture';

/** One small landmark (fitted to 10 m) at (100, 0, 100). */
const world = {
  placements: [{ id: 'statue', x: 100, y: 0, z: 100, rotation: 0, reasons: ['on high ground'], warnings: [] }],
  recipe: { places: [{ id: 'statue', kind: 'landmark', size: 'small', label: 'Statue', asset: 'stone statue', interaction: 'none', where: [] }] },
  buildings: [],
} as unknown as BuiltWorld;

const flush = () => new Promise((r) => setTimeout(r, 0));

function rig(object: THREE.Object3D) {
  const scene = new THREE.Scene();
  const addFixedBox = vi.fn((..._args: number[]) => ({}));
  const addFixedTrimesh = vi.fn((_p: Float32Array, _i: Uint32Array) => ({}));
  const physics = { addFixedBox, addFixedTrimesh, removeCollider: vi.fn() } as unknown as Physics;
  const models: ModelSource = { load: async () => ({ object, source: 'library' }) };
  return { scene, addFixedBox, addFixedTrimesh, objects: new WorldObjects(scene, physics, models) };
}

describe('WorldObjects with a rigged model (C1)', () => {
  it('draws a skinned model at its place, fitted to the height, and sizes the collider from it', async () => {
    const template = skinnedTemplate();
    const { objects, addFixedBox, addFixedTrimesh } = rig(template);
    objects.rebuild(world);
    await flush();
    const root = objects.group.children[0];
    const content = root.getObjectByName('content')!;
    expect(content.getObjectByName('skinned')).toBeDefined(); // the model replaced the placeholder
    const b = renderedBox(content);
    expect(b.min.y).toBeCloseTo(0, 4);
    expect(b.max.y).toBeCloseTo(10, 4);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(100, 4);
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(100, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(5, 4);
    expect(addFixedBox).not.toHaveBeenCalled();
    const collider = new THREE.Box3().setFromArray(addFixedTrimesh.mock.calls.at(-1)![0]);
    expect(collider.min.distanceTo(b.min)).toBeLessThan(1e-3);
    expect(collider.max.distanceTo(b.max)).toBeLessThan(1e-3);
    content.traverse((o) => { if (o instanceof THREE.SkinnedMesh) expect(o.frustumCulled).toBe(false); });
    // the template is shared by every copy: untouched, still the 2 m rig at the origin
    expect(template.parent).toBeNull();
    expect(renderedBox(template).max.y).toBeCloseTo(2, 4);
  });

  it('gives every placement its own skeleton', async () => {
    const template = skinnedTemplate();
    const { objects } = rig(template);
    objects.rebuild(world);
    await flush();
    const skinned = objects.group.getObjectByName('skinned') as THREE.SkinnedMesh;
    const original = template.getObjectByName('skinned') as THREE.SkinnedMesh;
    expect(skinned.skeleton).not.toBe(original.skeleton);
    for (const bone of skinned.skeleton.bones) expect(original.skeleton.bones).not.toContain(bone);
  });
});

describe('WorldObjects colliders follow the model', () => {
  it('a plain model gets a collider shaped like its surface (stand on what you see, not its bounding box)', async () => {
    const statue = new THREE.Group();
    statue.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 8)));
    const { objects, addFixedBox, addFixedTrimesh } = rig(statue);
    objects.rebuild(world);
    await flush();
    const [positions] = addFixedTrimesh.mock.calls.at(-1)!;
    const box = new THREE.Box3().setFromArray(positions);
    expect(box.max.y).toBeCloseTo(10, 3); // fitted to 10 m, in world space at the place
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(100, 3);
    expect(addFixedBox).not.toHaveBeenCalled();
  });
});

describe('WorldObjects rest on the ground', () => {
  /** One prop of this shape on ground rising 30 cm per metre along x. */
  async function placed(shape: THREE.Object3D, y = 30, interaction = 'none') {
    const onSlope = {
      placements: [{ id: 'thing', x: 100, y, z: 100, rotation: 0, reasons: [], warnings: [] }],
      recipe: { places: [{ id: 'thing', kind: 'prop', size: 'medium', label: 'Thing', asset: 'thing', interaction, where: [] }] },
      buildings: [],
      field: { heightAt: (x: number) => x * 0.3 },
    } as unknown as BuiltWorld;
    const { objects } = rig(shape);
    objects.rebuild(onSlope);
    await flush();
    return objects.group.children[0];
  }
  const longLog = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1))); return g; };
  const pole = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2))); return g; };

  it('a low prop leans to the slope, so neither end hangs in the air', async () => {
    const root = await placed(longLog());
    expect(root.rotation.z).toBeCloseTo(Math.atan(0.3), 5);
    expect(root.position.y).toBeCloseTo(30, 5); // the plane through the slope's own middle: no gap, no sinking
    const half = (root.userData.size as THREE.Vector3).x / 2;
    const lowEnd = new THREE.Vector3(-half, 0, 0).applyEuler(root.rotation).add(root.position);
    expect(lowEnd.y).toBeCloseTo(lowEnd.x * 0.3, 3); // on the ground under it
  });

  it('a tall thin prop stays upright and sinks a little to touch', async () => {
    const root = await placed(pole());
    expect(root.rotation.x === 0 && root.rotation.z === 0).toBe(true);
    expect(root.position.y).toBeLessThan(30);
    expect(root.position.y).toBeGreaterThan(29.5);
  });

  it('a wide sign on a thin post stays upright: only what touches the ground counts', async () => {
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1));
    post.position.y = 0.5;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.05));
    board.position.y = 0.85;
    sign.add(post, board);
    const root = await placed(sign);
    expect(root.rotation.x === 0 && root.rotation.z === 0).toBe(true);
  });

  it('something standing on something else keeps its height (a mug on a table)', async () => {
    const root = await placed(longLog(), 31);
    expect(root.position.y).toBe(31);
    expect(root.rotation.z).toBe(0);
  });

  it('a pushed prop is left to its own body', async () => {
    const root = await placed(longLog(), 30, 'push');
    expect(root.position.y).toBe(30);
    expect(root.rotation.z).toBe(0);
  });
});

describe('WorldObjects footprint cap', () => {
  it('a scattered prop stays prop-sized, however low and long its model', async () => {
    const long = new THREE.Group();
    long.add(new THREE.Mesh(new THREE.BoxGeometry(10, 1, 2)));
    const scattered = {
      placements: [], buildings: [], recipe: { places: [] },
      extras: [{ id: 'yard-prop-0-0', placeId: 'yard', asset: 'old cart', size: 'large', x: 0, y: 0, z: 0, rotation: 0 }],
    } as unknown as BuiltWorld;
    const { objects } = rig(long);
    objects.rebuild(scattered);
    await flush();
    const size = new THREE.Box3().setFromObject(objects.group.children[0].getObjectByName('content')!).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeCloseTo(5, 3);
  });

  it('a low, wide model fitted to a landmark height is shrunk to at most 4x as wide as tall', async () => {
    const cover = new THREE.Group();
    cover.add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.5, 12))); // 10 m wide, 0.5 m tall
    const { objects } = rig(cover);
    objects.rebuild(world); // a small landmark: fitted to 10 m tall → 200 m wide before the cap
    await flush();
    const size = new THREE.Box3().setFromObject(objects.group.children[0].getObjectByName('content')!).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(40.01);
  });
});

describe('WorldObjects: places added while playing wait for their model (no stand-in house first)', () => {
  function deferred() {
    let resolve!: (v: Awaited<ReturnType<ModelSource['load']>>) => void;
    const promise = new Promise<Awaited<ReturnType<ModelSource['load']>>>((r) => { resolve = r; });
    return { promise, resolve };
  }
  function waitRig() {
    const d = deferred();
    const physics = { addFixedBox: vi.fn(() => ({})), addFixedTrimesh: vi.fn(() => ({})), removeCollider: vi.fn() } as unknown as Physics;
    const objects = new WorldObjects(new THREE.Scene(), physics, { load: () => d.promise });
    const events: string[] = [];
    objects.onLoading.push((e) => events.push(`${e.state}:${e.placeId}:${e.label}`));
    const ready = vi.fn();
    objects.onReady.push(ready);
    return { d, objects, events, ready, physics };
  }

  it('shows nothing until the model arrives, then the model, and reports loading → ready', async () => {
    const { d, objects, events, ready } = waitRig();
    objects.rebuild(world, new Set(['statue']));
    const root = objects.group.children[0];
    expect(root.getObjectByName('content')).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();
    expect(events).toEqual(['loading:statue:Statue']);
    d.resolve({ object: skinnedTemplate(), source: 'library' });
    await flush();
    expect(root.getObjectByName('skinned')).toBeDefined();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['loading:statue:Statue', 'ready:statue:Statue']);
  });

  it('falls back to the simple shape and says so when no model exists', async () => {
    const { d, objects, events, ready } = waitRig();
    objects.rebuild(world, new Set(['statue']));
    d.resolve(null);
    await flush();
    expect(objects.group.children[0].getObjectByName('content')).toBeDefined();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toBe('missing:statue:Statue');
  });

  it('keeps waiting across a rebuild while the model is still loading, and cancels when the place is gone', async () => {
    const { d, objects, events } = waitRig();
    objects.rebuild(world, new Set(['statue']));
    objects.rebuild(world); // another edit: the statue is kept but its model has not arrived yet
    expect(objects.group.children[0].getObjectByName('content')).toBeUndefined();
    objects.rebuild({ ...world, placements: [], recipe: { places: [] } } as unknown as BuiltWorld);
    expect(events.at(-1)).toBe('cancelled:statue:Statue');
    d.resolve({ object: skinnedTemplate(), source: 'library' });
    await flush();
    expect(events.at(-1)).toBe('cancelled:statue:Statue');
  });

  it('with a server (no stand-ins): a new world announces every place, shows nothing until models arrive, leaves misses out', async () => {
    const { d, objects, events, ready } = waitRig();
    objects.standIns = false;
    objects.rebuild(world, new Set(), true);
    expect(objects.group.children[0].getObjectByName('content')).toBeUndefined();
    expect(events).toEqual(['loading:statue:Statue']);
    d.resolve(null);
    await flush();
    expect(objects.group.children[0].getObjectByName('content')).toBeUndefined(); // no stand-in shape, ever
    expect(ready).not.toHaveBeenCalled();
    expect(events.at(-1)).toBe('missing:statue:Statue');
  });

  it('with a server, places kept through an edit wait silently (no notice flood)', () => {
    const { objects, events } = waitRig();
    objects.standIns = false;
    objects.rebuild(world);
    expect(objects.group.children[0].getObjectByName('content')).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('without a wait set, objects appear at once as before', () => {
    const { objects, events } = waitRig();
    objects.rebuild(world);
    expect(objects.group.children[0].getObjectByName('content')).toBeDefined();
    expect(events).toEqual([]);
  });
});
