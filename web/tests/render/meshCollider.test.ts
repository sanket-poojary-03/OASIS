import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { baseOf, MAX_COLLIDER_TRIS, MAX_REACH_TRIS, simplifySurface, surfaceOf } from '../../src/render/meshCollider';
import { renderedBox, skinnedTemplate } from './rigFixture';

const raw = (g: THREE.BufferGeometry) => ({ positions: g.getAttribute('position').array as Float32Array, indices: new Uint32Array(g.index!.array) });

describe('surfaceOf', () => {
  it('gives the drawn triangles in world space (position, rotation and scale applied)', () => {
    const root = new THREE.Group();
    root.position.set(10, 2, -5);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.1, 8));
    disc.scale.set(2, 1, 2);
    root.add(disc);
    const s = surfaceOf(root)!;
    const box = new THREE.Box3().setFromArray(s.positions);
    expect(box.min.x).toBeCloseTo(4, 3);
    expect(box.max.x).toBeCloseTo(16, 3);
    expect(box.max.y).toBeCloseTo(2.05, 3); // a flat disc stays flat: you stand on it, not on a tall box
    expect(s.indices.length % 3).toBe(0);
    expect(Math.max(...s.indices)).toBeLessThan(s.positions.length / 3);
  });

  it('follows a rigged model as drawn, instead of a box around it', () => {
    const rig = skinnedTemplate();
    const s = surfaceOf(rig)!;
    const box = new THREE.Box3().setFromArray(s.positions), drawn = renderedBox(rig);
    expect(box.min.distanceTo(drawn.min)).toBeLessThan(1e-4);
    expect(box.max.distanceTo(drawn.max)).toBeLessThan(1e-4);
  });

  it('reads a model the range culler has hidden, but not a hidden part of it', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const hiddenPart = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20));
    hiddenPart.visible = false;
    root.add(body, hiddenPart);
    root.visible = false; // far away when its model finished loading
    const box = new THREE.Box3().setFromArray(surfaceOf(root)!.positions);
    expect(box.max.x).toBeCloseTo(1, 5);
  });

  it('has nothing to give for an empty model', () => {
    expect(surfaceOf(new THREE.Group())).toBeNull();
  });

  it('simplifies a heavy model to the limit, keeping its size', () => {
    const heavy = new THREE.Group();
    heavy.add(new THREE.Mesh(new THREE.SphereGeometry(5, 200, 100)));
    const s = surfaceOf(heavy)!;
    expect(s.indices.length / 3).toBeLessThanOrEqual(MAX_COLLIDER_TRIS + MAX_REACH_TRIS); // what you can walk into has its own share
    expect(s.indices.length / 3).toBeGreaterThan(100); // still a shape, not a handful of triangles
    const size = new THREE.Box3().setFromArray(s.positions).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(9.5);
    expect(size.y).toBeGreaterThan(9.5);
  });
  it('keeps a thin trunk under a wide, heavy canopy solid from every side (a giant tree)', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 10, 12).translate(1.5, 5, -0.5))); // off-centre, as real trees are
    root.add(new THREE.Mesh(new THREE.SphereGeometry(12, 64, 48).translate(0, 20, 0)));
    const s = surfaceOf(root)!;
    expect(s.indices.length / 3).toBeLessThanOrEqual(MAX_COLLIDER_TRIS + MAX_REACH_TRIS);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
    for (const y of [0.4, 1, 1.8]) for (let k = 0; k < 8; k++) {
      const dir = new THREE.Vector3(Math.cos((k / 8) * Math.PI * 2), 0, Math.sin((k / 8) * Math.PI * 2));
      const ray = new THREE.Ray(new THREE.Vector3(1.5, y, -0.5).addScaledVector(dir, -5), dir);
      let nearest = Infinity;
      for (let i = 0; i < s.indices.length; i += 3) {
        a.fromArray(s.positions, s.indices[i] * 3); b.fromArray(s.positions, s.indices[i + 1] * 3); c.fromArray(s.positions, s.indices[i + 2] * 3);
        if (ray.intersectTriangle(a, b, c, false, hit)) nearest = Math.min(nearest, hit.distanceTo(ray.origin));
      }
      expect(nearest, `walking in at y=${y} from direction ${k}`).toBeLessThan(5 - 0.3); // stopped at the bark, not inside it
    }
  });

});

describe('simplifySurface', () => {
  it('leaves a model under the limit untouched', () => {
    const s = raw(new THREE.BoxGeometry(1, 1, 1));
    expect(simplifySurface(s, 1000)).toBe(s);
  });

  it('keeps the gap under an overhang, which a box or a convex hull would fill', () => {
    // A thin post with a wide, detailed roof over it.
    const roof = new THREE.BoxGeometry(10, 0.5, 10, 40, 2, 40);
    roof.translate(0, 5, 0);
    const post = new THREE.BoxGeometry(1, 5, 1, 10, 30, 10);
    post.translate(0, 2.5, 0);
    const a = raw(roof), b = raw(post);
    const offset = a.positions.length / 3;
    const s = simplifySurface({
      positions: new Float32Array([...a.positions, ...b.positions]),
      indices: new Uint32Array([...a.indices, ...[...b.indices].map((i) => i + offset)]),
    }, 800);
    expect(s.indices.length / 3).toBeLessThanOrEqual(800);
    for (let i = 0; i < s.positions.length; i += 3) {
      const x = s.positions[i], y = s.positions[i + 1], z = s.positions[i + 2];
      // Nothing near the ground out beside the post: a walker can stand under the eaves.
      if (y < 4) expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(1.5);
    }
  });

  it('drops the triangles that collapse, and points only at real vertices', () => {
    const s = simplifySurface(raw(new THREE.SphereGeometry(1, 64, 32)), 200);
    const count = s.positions.length / 3;
    for (let i = 0; i < s.indices.length; i += 3) {
      const [a, b, c] = [s.indices[i], s.indices[i + 1], s.indices[i + 2]];
      expect(a !== b && b !== c && a !== c).toBe(true);
      expect(Math.max(a, b, c)).toBeLessThan(count);
    }
  });
});

describe('baseOf', () => {
  it('finds what meets the ground, not what sticks out above it', () => {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2));
    pole.position.y = 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2));
    arm.position.set(1.5, 3.9, 0);
    lamp.add(pole, arm);
    const base = baseOf(lamp);
    expect(base.maxX).toBeCloseTo(0.1, 3);
    expect(base.minX).toBeCloseTo(-0.1, 3);
  });

  it('is zero for an empty model', () => {
    expect(baseOf(new THREE.Group())).toEqual({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
  });
});
