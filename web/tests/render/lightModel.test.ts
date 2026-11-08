import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitTriangles, triangleCount } from '../../src/render/lightModel';

/** A two-material "tree": a dense trunk (about 12k triangles) and a lighter crown (about 4k). */
function heavyTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }));
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2, 48, 42), new THREE.MeshStandardMaterial({ color: 0x3f7a32 }));
  crown.position.y = 3;
  g.add(trunk, crown);
  return g;
}

describe('lightModel: a scatter model is held to a triangle budget', () => {
  it('counts the triangles of every mesh', () => {
    expect(triangleCount(heavyTree())).toBeGreaterThan(15000);
  });

  it('simplifies each mesh in proportion until the whole is about the budget, keeping its materials and attributes', async () => {
    const tree = heavyTree();
    const before = tree.children.map((m) => (m as THREE.Mesh).material);
    await fitTriangles(tree, 4000);
    const total = triangleCount(tree);
    expect(total).toBeLessThanOrEqual(4400);
    expect(total).toBeGreaterThan(2000);
    tree.children.forEach((m, i) => {
      const mesh = m as THREE.Mesh;
      expect(mesh.material).toBe(before[i]);
      for (const a of ['position', 'normal', 'uv']) expect(mesh.geometry.getAttribute(a)).toBeDefined();
      expect(triangleCount(mesh)).toBeGreaterThan(200); // the light crown keeps its share, it is not wiped out
    });
  });

  it('leaves a model under the budget exactly as it was', async () => {
    const tree = heavyTree();
    const geos = tree.children.map((m) => (m as THREE.Mesh).geometry);
    await fitTriangles(tree, 50000);
    tree.children.forEach((m, i) => expect((m as THREE.Mesh).geometry).toBe(geos[i]));
  });

  it('never touches the geometry of a clone it shares it with', async () => {
    const tree = heavyTree(), copy = tree.clone(true);
    const full = triangleCount(copy);
    await fitTriangles(tree, 3000);
    expect(triangleCount(copy)).toBe(full);
  });
});
