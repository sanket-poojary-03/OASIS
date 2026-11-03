import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitToHeight } from '../../src/render/fit';
import { ScatterAssets } from '../../src/render/scatterAssets';
import { normalizeTo } from '../../src/render/worldObjects';

/** A 2 x 4 x 2 box whose centre sits at (5, 10, -3), inside a parent group with a non-unit scale. */
function offsetModel(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshStandardMaterial());
  m.position.set(5, 10, -3);
  g.add(m);
  g.scale.setScalar(3);
  return g;
}

const boxOf = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

describe('fitToHeight (M9: one helper for "scale to height, feet at y = 0")', () => {
  it('scales to the height, stands on y = 0 and centres x/z', () => {
    const b = boxOf(fitToHeight(offsetModel(), 6));
    expect(b.max.y - b.min.y).toBeCloseTo(6, 5);
    expect(b.min.y).toBeCloseTo(0, 5);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 5);
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0, 5);
  });

  it('can leave x/z alone (animated models keep their own pivot)', () => {
    const o = offsetModel();
    const before = boxOf(o).getCenter(new THREE.Vector3());
    const b = boxOf(fitToHeight(o, 2, false));
    expect(b.min.y).toBeCloseTo(0, 5);
    expect(b.max.y).toBeCloseTo(2, 5);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(before.x * (2 / 12), 5);
  });

  it('leaves an empty object untouched', () => {
    const g = new THREE.Group();
    fitToHeight(g, 5);
    expect(g.scale.x).toBe(1);
    expect(g.position.y).toBe(0);
  });

  it('normalizeTo uses it and wraps the result in a "content" group', () => {
    const c = normalizeTo(offsetModel(), 3);
    expect(c.name).toBe('content');
    const b = boxOf(c);
    expect(b.max.y - b.min.y).toBeCloseTo(3, 5);
    expect(b.min.y).toBeCloseTo(0, 5);
  });
});

describe('ScatterAssets.useModel', () => {
  const items = [{ kind: 'rock' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 }];

  it('replaces a procedural kind with one merged geometry fitted to the height', () => {
    const s = new ScatterAssets();
    const procedural = (s.instance(items).children[0] as THREE.InstancedMesh).geometry;
    const model = offsetModel();
    const mat = (model.children[0] as THREE.Mesh).material;
    s.useModel('rock', model, 1.2);
    const mesh = s.instance(items).children[0] as THREE.InstancedMesh;
    expect(mesh.geometry).not.toBe(procedural);
    expect(mesh.material).toBe(mat);
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    expect(bb.max.y - bb.min.y).toBeCloseTo(1.2, 5);
    expect(bb.min.y).toBeCloseTo(0, 5);
    expect(s.hasModel('rock')).toBe(true);
    expect(s.hasModel('tree')).toBe(false);
  });

  it('keeps the procedural shape when the object has no meshes', () => {
    const s = new ScatterAssets();
    s.useModel('rock', new THREE.Group(), 1.2);
    expect(s.hasModel('rock')).toBe(false);
    expect((s.instance(items).children[0] as THREE.InstancedMesh).geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});
