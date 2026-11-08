import { describe, expect, it } from 'vitest';
import { parseRecipe, type Recipe } from '../../src/core/recipe';
import { buildWorld } from '../../src/world/build';
import { createField } from '../../src/world/field';
import { findPath } from '../../src/world/roads';
import { loadRecipeFixture } from '../fixtures';

/** A flat, dry world with the given places. */
function world(places: unknown[]): Recipe {
  const base = loadRecipeFixture('fishing-valley');
  const parsed = parseRecipe({ ...base, terrain: { shape: 'plains', roughness: 0.1, height: 0.2, seaLevel: 0 }, water: { river: false, lake: false }, places, paths: [] });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.recipe;
}

const town = (pattern: string, extra: Record<string, unknown> = {}) => ({
  id: 'town', kind: 'settlement', label: 'Town', asset: 'wooden cottage', size: 'large', layout: { pattern, count: 16, ...extra },
});

describe('nothing stands on a road', () => {
  for (const pattern of ['grid', 'ring', 'line', 'scatter', 'village']) {
    it(`a ${pattern} keeps its members off every road`, () => {
      const w = buildWorld(world([town(pattern, { centre: 'stone fountain' }), { id: 'tower', kind: 'landmark', label: 'Tower', asset: 'stone tower', size: 'medium' }]));
      const houses = w.buildings.filter((b) => b.kind === 'house');
      expect(houses.length).toBeGreaterThan(0);
      for (const h of houses) expect(w.field.isOnRoad(h.x, h.z, h.footprint / 2), `${h.id} on a road`).toBe(false);
    });
  }

  it('kerb props stay off every road, and parked cars stay out of the crossings', () => {
    const w = buildWorld(world([{ ...town('grid', { height: 'tall' }), asset: 'glass skyscraper',
      props: [{ asset: 'metal bench', count: 6, size: 'small' }, { asset: 'parked taxi car', count: 6, size: 'large' }] }]));
    const benches = w.extras.filter((e) => e.asset === 'metal bench');
    expect(benches.length).toBeGreaterThan(0);
    for (const b of benches) expect(w.field.isOnRoad(b.x, b.z, 0.5), `${b.id} on a road`).toBe(false);
    const crossings = w.field.roads.flatMap((r) => w.field.roads.filter((o) => o !== r).flatMap((o) => o.points.filter((p) => r.points.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 1))));
    for (const car of w.extras.filter((e) => e.asset === 'parked taxi car')) {
      for (const c of crossings) expect(Math.hypot(car.x - c.x, car.z - c.z)).toBeGreaterThan(4);
    }
  });

  it('a road goes around what stands in its way', () => {
    const f = createField(world([]));
    const from = { x: -100, z: 0 }, to = { x: 100, z: 0 };
    const road = findPath(f, from, to, 8, true, [{ x: 0, z: 0, r: 20 }])!;
    for (const p of road.points) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(14);
  });

  it('measures a road from its own edge, however wide it is', () => {
    const f = createField(world([]));
    f.addRoad({ points: [{ x: -50, z: 100 }, { x: 50, z: 100 }], width: 8, bridges: [false] });
    expect(f.isOnRoad(0, 103.5)).toBe(true);
    expect(f.isOnRoad(0, 105)).toBe(false);
    expect(f.isReserved(0, 105, 1.5)).toBe(true);
  });
});

describe('buildings have room', () => {
  it('a grid leaves a street and pavements between towers, and some lots open', () => {
    const w = buildWorld(world([{ ...town('grid', { height: 'tall', count: 36 }), asset: 'glass skyscraper' }]));
    const houses = w.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBe(36);
    for (const a of houses) for (const b of houses) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(25);
  });
});
