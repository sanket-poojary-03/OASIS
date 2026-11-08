import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { matteMaterials } from '../../src/render/matte';
import { ScatterAssets } from '../../src/render/scatterAssets';

const mesh = (m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);

describe('matteMaterials', () => {
  it('takes the metal off materials that would only draw dark, in every mesh', () => {
    const a = new THREE.MeshStandardMaterial({ metalness: 0.4 }), b = new THREE.MeshStandardMaterial({ metalness: 1 });
    const g = new THREE.Group();
    g.add(mesh(a), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [b]));
    expect(matteMaterials(g)).toBe(g);
    expect(a.metalness).toBe(0);
    expect(b.metalness).toBe(0);
  });

  it('keeps a material that has its own metal map, and leaves other materials alone', () => {
    const mapped = new THREE.MeshStandardMaterial({ metalness: 0.8, metalnessMap: new THREE.Texture() });
    const basic = new THREE.MeshBasicMaterial();
    const g = new THREE.Group();
    g.add(mesh(mapped), mesh(basic));
    matteMaterials(g);
    expect(mapped.metalness).toBe(0.8);
  });
});

describe('scatter models', () => {
  it('draws only the lightest models in the outer rings, and all of them near', () => {
    const scatter = new ScatterAssets();
    const sized = (segments: number) => new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments), new THREE.MeshStandardMaterial());
    for (const n of [32, 8, 16, 24]) scatter.useModel('tree', sized(n), 6);
    const items = Array.from({ length: 12 }, (_, i) => ({ kind: 'tree' as const, x: i, y: 0, z: 0, rotation: 0, scale: 1, variant: i }));
    expect(scatter.instance(items, 0).children).toHaveLength(4);
    const far = scatter.instance(items, 1).children as THREE.InstancedMesh[];
    expect(far).toHaveLength(2);
    const near = scatter.instance(items, 0).children as THREE.InstancedMesh[];
    const heaviest = Math.max(...near.map((m) => m.geometry.getAttribute('position').count));
    for (const m of far) expect(m.geometry.getAttribute('position').count).toBeLessThan(heaviest);
  });
});
