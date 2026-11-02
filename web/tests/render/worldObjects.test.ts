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
  const physics = { addFixedBox, removeCollider: vi.fn() } as unknown as Physics;
  const models: ModelSource = { load: async () => ({ object, source: 'library' }) };
  return { scene, addFixedBox, objects: new WorldObjects(scene, physics, models) };
}

describe('WorldObjects with a rigged model (C1)', () => {
  it('draws a skinned model at its place, fitted to the height, and sizes the collider from it', async () => {
    const template = skinnedTemplate();
    const { objects, addFixedBox } = rig(template);
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
    const [x, y, z, hx, hy, hz] = addFixedBox.mock.calls.at(-1)!;
    expect([x, y, z]).toEqual([100, 5, 100]);
    expect(hx).toBeCloseTo(2.5, 4);
    expect(hy).toBeCloseTo(5, 4);
    expect(hz).toBeCloseTo(2.5, 4);
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
