import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WaterSystem } from '../../src/render/water';
import { foamUniforms } from '../../src/render/shoreFoam';
import { rippleNormals } from '../../src/render/waterNormals';
import type { WorldField } from '../../src/world/field';

function field(over: Partial<WorldField> & { water?: string } = {}): WorldField {
  const { water, ...rest } = over;
  return { hasSea: true, seaLevelY: 4, deckY: null, river: [], lakes: [], recipe: { palette: water ? { water } : undefined }, baseHeight: () => 0, ...rest } as unknown as WorldField;
}

function lights(sun: number, moon: number) {
  const s = new THREE.DirectionalLight(0xffffff, sun), m = new THREE.DirectionalLight(0xa9bfff, moon);
  s.position.set(0, 10, 0);
  m.position.set(10, 0, 0);
  return { sun: s, moon: m };
}

const seaOf = (w: WaterSystem) => w.group.children.find((c) => 'isWater' in c) as unknown as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

describe('rippleNormals', () => {
  it('tiles, and every texel is a unit normal pointing up', () => {
    const n = 64, d = rippleNormals(n);
    const at = (x: number, y: number, c: number) => d[(x + y * n) * 4 + c];
    let gap = 0;
    for (let i = 0; i < n; i++) {
      gap = Math.max(gap, Math.abs(at(0, i, 0) - at(n - 1, i, 0)), Math.abs(at(i, 0, 1) - at(i, n - 1, 1)));
    }
    // Wrapping across an edge is no bigger a step than between any two neighbours.
    let step = 0;
    for (let i = 1; i < n; i++) step = Math.max(step, Math.abs(at(i, 7, 0) - at(i - 1, 7, 0)));
    expect(gap).toBeLessThanOrEqual(step * 1.5);
    for (let k = 0; k < d.length; k += 4) {
      const x = d[k] / 127.5 - 1, y = d[k + 1] / 127.5 - 1, z = d[k + 2] / 127.5 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
      expect(z).toBeGreaterThan(0);
    }
  });

  it('is the same every time', () => {
    expect(rippleNormals(16)).toEqual(rippleNormals(16));
  });
});

describe('WaterSystem', () => {
  it('lays a sea at sea level facing up, in the palette colour', () => {
    const w = new WaterSystem(new THREE.Scene());
    w.rebuild(field({ water: '#800080' }));
    const sea = seaOf(w);
    expect(sea.position.y).toBe(4);
    sea.updateMatrixWorld();
    expect(new THREE.Vector3(0, 0, 1).transformDirection(sea.matrixWorld).y).toBeCloseTo(1);
    w.update(new THREE.Vector3(), 0, lights(2.6, 0));
    expect(sea.material.uniforms.waterColor.value.getHexString()).toBe('800080');
  });

  it('has no sea in a world without one, and reuses the one sea across worlds', () => {
    const w = new WaterSystem(new THREE.Scene());
    w.rebuild(field({ hasSea: false }));
    expect(seaOf(w)).toBeUndefined();
    w.rebuild(field());
    const first = seaOf(w);
    w.rebuild(field());
    expect(seaOf(w)).toBe(first);
    expect(w.group.children.length).toBe(1);
  });

  it('moves the ripples with time and keeps the sea under the viewer', () => {
    const w = new WaterSystem(new THREE.Scene());
    w.rebuild(field());
    w.update(new THREE.Vector3(120, 9, -80), 12.5, lights(2.6, 0));
    const sea = seaOf(w);
    expect(sea.material.uniforms.time.value).toBe(12.5);
    expect(foamUniforms.uFoamTime.value).toBe(12.5);
    expect(sea.position.x).toBe(100);
    expect(sea.position.z).toBe(-100);
    expect(sea.position.y).toBe(4);
  });

  it('dims the sea at night and takes its glint from the moon', () => {
    const w = new WaterSystem(new THREE.Scene());
    w.rebuild(field());
    const sea = seaOf(w), u = sea.material.uniforms;
    w.update(new THREE.Vector3(), 0, lights(2.6, 0));
    const day = (u.waterColor.value as THREE.Color).g;
    expect((u.sunDirection.value as THREE.Vector3).y).toBeCloseTo(1);
    w.update(new THREE.Vector3(), 0, lights(0, 0.5));
    expect((u.waterColor.value as THREE.Color).g).toBeLessThan(day * 0.2);
    expect((u.sunDirection.value as THREE.Vector3).x).toBeCloseTo(1);
    expect((u.sunColor.value as THREE.Color).r).toBeLessThan(0.5);
  });

  it('foams on shores, but not in an ocean, which has none', () => {
    const w = new WaterSystem(new THREE.Scene());
    w.rebuild(field());
    expect(foamUniforms.uFoamOn.value).toBe(1);
    expect(foamUniforms.uFoamSea.value).toBe(4);
    w.rebuild(field({ deckY: 5 }));
    expect(foamUniforms.uFoamOn.value).toBe(0);
    w.rebuild(field({ hasSea: false }));
    expect(foamUniforms.uFoamOn.value).toBe(0);
  });
});
