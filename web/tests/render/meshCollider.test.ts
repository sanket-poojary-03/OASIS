import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_COLLIDER_TRIS, surfaceOf } from '../../src/render/meshCollider';
import { skinnedTemplate } from './rigFixture';

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

  it('falls back (null) for rigged, empty or very heavy models', () => {
    expect(surfaceOf(skinnedTemplate())).toBeNull();
    expect(surfaceOf(new THREE.Group())).toBeNull();
    const heavy = new THREE.Group();
    heavy.add(new THREE.Mesh(new THREE.SphereGeometry(1, 200, 100)));
    expect(new THREE.SphereGeometry(1, 200, 100).index!.count / 3).toBeGreaterThan(MAX_COLLIDER_TRIS);
    expect(surfaceOf(heavy)).toBeNull();
  });
});
