import { describe, expect, it } from 'vitest';
import { addBridgeColliders, bridgeDeckData, densify, removeBridgeColliders, roadY } from '../../src/render/roads';
import { ribbonData } from '../../src/render/ribbon';

// land at y=2 except a water band 20<x<40 with surface 1 (terrain 0 there)
const field = {
  heightAt: (x: number) => (x > 20 && x < 40 ? 0 : 2),
  waterSurfaceAt: (x: number) => (x > 20 && x < 40 ? 1 : null),
};
const road = { points: [0, 10, 20, 30, 40, 50, 60].map((x) => ({ x, z: 0 })), width: 4, bridges: [false, false, true, true, false, false] };

describe('bridge colliders', () => {
  it('uses the same vertices as the drawn ribbon', () => {
    const d = bridgeDeckData(field, road);
    expect(d).toHaveLength(1);
    const dense = densify(road.points, road.bridges).points;
    const full = ribbonData(dense, 2, (x, z) => roadY(field, x, z)).positions;
    const sub = d[0].positions;
    let found = false;
    for (let o = 0; o + sub.length <= full.length; o += 6) if (sub.every((v, i) => v === full[o + i])) found = true;
    expect(found).toBe(true);
  });
  it('deck height changes less than 0.6 m per densified step along the bridge span', () => {
    const p = bridgeDeckData(field, road)[0].positions;
    for (let i = 2; i < p.length / 6; i++) expect(Math.abs(p[i * 6 + 1] - p[(i - 1) * 6 + 1])).toBeLessThan(1.3);
    const inner = [];
    for (let x = 21; x < 40; x += 3) inner.push(roadY(field, x, 0));
    for (let i = 1; i < inner.length; i++) expect(Math.abs(inner[i] - inner[i - 1])).toBeLessThan(0.6);
  });
  it('skips non-bridge roads and creates one collider per run; removable', () => {
    const calls: Array<[Float32Array, Uint32Array]> = [];
    const removed: unknown[] = [];
    const fake = { addTerrain: (p: Float32Array, i: Uint32Array) => { calls.push([p, i]); return { id: calls.length } as never; } };
    expect(addBridgeColliders(field, [{ ...road, bridges: road.bridges.map(() => false) }], fake)).toHaveLength(0);
    const two = { ...road, bridges: [true, false, true, false, true, false] };
    const hs = addBridgeColliders(field, [road, two], fake);
    expect(hs).toHaveLength(4);
    removeBridgeColliders(hs, { removeCollider: (c: unknown) => { removed.push(c); } } as never);
    expect(removed).toHaveLength(4);
    expect(hs).toHaveLength(0);
  });
  it('handles empty and single-point roads', () => {
    expect(densify([]).points).toEqual([]);
    expect(bridgeDeckData(field, { points: [{ x: 0, z: 0 }], width: 4, bridges: [] })).toEqual([]);
  });
});
