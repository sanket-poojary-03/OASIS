import { describe, expect, it } from 'vitest';
import { addBridgeColliders, bridgeDeckData, bridgeFrame, deckSurface, densify, drawnRoad, removeBridgeColliders, roadY } from '../../src/render/roads';
import { ribbonData } from '../../src/render/ribbon';

// land at y=2 except a water band 20<x<40 with surface 1 (terrain 0 there)
const field = {
  heightAt: (x: number) => (x > 20 && x < 40 ? 0 : 2),
  waterSurfaceAt: (x: number) => (x > 20 && x < 40 ? 1 : null),
  meshHeightAt: (x: number) => (x > 20 && x < 40 ? 0 : 2),
};
const road = { points: [0, 10, 20, 40, 50, 60].map((x) => ({ x, z: 0 })), width: 4, bridges: [false, false, true, false, false] };

describe('bridge colliders', () => {
  it('uses the same vertices as the drawn ribbon', () => {
    const d = bridgeDeckData(field, road);
    expect(d).toHaveLength(1);
    const { points, yAt } = drawnRoad(field, road);
    const full = ribbonData(points, 2, yAt).positions;
    const sub = d[0].positions;
    let found = false;
    for (let o = 0; o + sub.length <= full.length; o += 6) if (sub.every((v, i) => v === full[o + i])) found = true;
    expect(found).toBe(true);
  });
  it('deck height changes less than 0.6 m per densified step along the bridge span', () => {
    const p = bridgeDeckData(field, road)[0].positions;
    for (let i = 1; i < p.length / 6; i++) expect(Math.abs(p[i * 6 + 1] - p[(i - 1) * 6 + 1])).toBeLessThan(0.6);
  });
  it('a deck starts and ends on its banks and clears the water between them', () => {
    const { points, bridge, yAt } = drawnRoad(field, road);
    const first = bridge.indexOf(true), last = bridge.lastIndexOf(true) + 1;
    const lift = (i: number) => yAt(points[i].x, points[i].z) - field.heightAt(points[i].x);
    expect(lift(first)).toBeCloseTo(0.12, 5);
    expect(lift(last)).toBeCloseTo(0.12, 5);
    for (let i = first + 1; i < last; i++) expect(yAt(points[i].x, points[i].z)).toBeGreaterThan(1);
    const highest = Math.max(...points.slice(first, last + 1).map((q) => yAt(q.x, q.z)));
    expect(highest).toBeGreaterThan(2.5); // the middle stands well clear
  });
  it('a plain road hugs the ground, even close to a river', () => {
    const bank = { heightAt: () => 3, waterSurfaceAt: () => 2 }; // within a river's reach, above its water
    expect(roadY(bank, 0, 0)).toBeCloseTo(3.12, 5);
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
  it('a bridge stands on posts down to the bed, with rails along both sides', () => {
    const { points, bridge, yAt } = drawnRoad(field, road);
    const span = points.filter((_, i) => bridge[i] || bridge[i - 1]);
    const frame = bridgeFrame(field, span, road.width, yAt);
    expect(frame.posts.length).toBeGreaterThanOrEqual(4);
    for (const p of frame.posts) {
      expect(p.bottom).toBeLessThanOrEqual(field.meshHeightAt(p.x));
      expect(p.top).toBeGreaterThan(yAt(p.x, 0));
    }
    expect(frame.posts.some((p) => p.z > 0)).toBe(true);
    expect(frame.posts.some((p) => p.z < 0)).toBe(true);
    expect(frame.rails).toHaveLength((span.length - 1) * 2);
    for (const r of frame.rails) expect(r.a.y).toBeGreaterThan(yAt(r.a.x, 0));
  });
  it('handles empty and single-point roads', () => {
    expect(densify([]).points).toEqual([]);
    expect(bridgeDeckData(field, { points: [{ x: 0, z: 0 }], width: 4, bridges: [] })).toEqual([]);
  });
});

describe('deckSurface', () => {
  // A dry gap: a rim at y=50 either side of 0<x<100, the floor at y=0.
  const gap = { heightAt: (x: number) => (x > 0 && x < 100 ? 0 : 50), waterSurfaceAt: () => null, meshHeightAt: (x: number) => (x > 0 && x < 100 ? 0 : 50) };
  const span = { points: [{ x: 0, z: 0 }, { x: 100, z: 0 }], width: 4, bridges: [true], high: [true] };

  it('carries what is on the deck, and leaves what is under it on the ground', () => {
    const at = deckSurface(gap, [span]);
    expect(at(50, 0, 51)).toBeGreaterThan(50);
    expect(at(50, 0, 0)).toBeNull();
  });
  it('is only as wide as the deck and as long as the span', () => {
    const at = deckSurface(gap, [span]);
    expect(at(50, 2.5, 50)).toBeNull();
    expect(at(-5, 0, 50)).toBeNull();
    expect(at(105, 0, 50)).toBeNull();
  });
  it('matches the drawn deck', () => {
    const at = deckSurface(gap, [span]);
    const { points, yAt } = drawnRoad(gap, span);
    for (const p of points) expect(at(p.x, p.z, 60)).toBeCloseTo(yAt(p.x, p.z), 5);
  });
  it('holds a tall deck up on piers, with rails that stop at the deck', () => {
    const { points, yAt } = drawnRoad(gap, span);
    const frame = bridgeFrame(gap, points, span.width, yAt);
    expect(frame.piers.length).toBeGreaterThan(0);
    expect(frame.girder).toHaveLength(points.length - 1);
    for (const p of frame.piers) expect(p.bottom).toBeLessThanOrEqual(0);
    const inTheGap = frame.posts.filter((p) => p.x > 5 && p.x < 95);
    expect(inTheGap.length).toBeGreaterThan(0);
    for (const p of inTheGap) expect(p.bottom).toBeGreaterThan(40);
  });
});
