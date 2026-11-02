import { describe, expect, it } from 'vitest';
import { parseRecipe, type Recipe } from '../../src/core/recipe';
import { buildWorld } from '../../src/world/build';
import { createField } from '../../src/world/field';
import { placeRadius, solvePlacements } from '../../src/world/placement';
import { layoutSettlement } from '../../src/world/settlement';
import { loadRecipeFixture } from '../fixtures';

/** A flat, dry world holding one group with the given layout. */
function world(layout: Record<string, unknown> | undefined, asset = 'modern apartment block', size = 'large'): Recipe {
  const base = loadRecipeFixture('fishing-valley');
  const parsed = parseRecipe({
    ...base,
    terrain: { shape: 'plains', roughness: 0.1, height: 0.2, seaLevel: 0 },
    water: { river: false, lake: false },
    places: [{ id: 'town', kind: 'settlement', label: 'Town', asset, size, ...(layout ? { layout } : {}) }],
    paths: [],
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.recipe;
}

function lay(r: Recipe) {
  const field = createField(r);
  const pl = solvePlacements(r, field).find((p) => p.id === 'town')!;
  const place = r.places[0];
  return { field, pl, ...layoutSettlement(place, pl, field, r.seed) };
}

const members = (bs: ReturnType<typeof lay>['buildings']) => bs.filter((b) => b.kind === 'house');
const minGap = (bs: Array<{ x: number; z: number }>) => {
  let m = Infinity;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) m = Math.min(m, Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z));
  return m;
};

describe('group layout in the recipe', () => {
  it('is optional, defaults to a village of low buildings, and caps the count at 60', () => {
    expect(world(undefined).places[0].layout).toBeUndefined();
    expect(world({ pattern: 'grid' }).places[0].layout).toMatchObject({ pattern: 'grid', height: 'low' });
    expect(world({}).places[0].layout).toMatchObject({ pattern: 'village' });
    expect(() => world({ pattern: 'grid', count: 61 })).toThrow();
    expect(() => world({ pattern: 'spiral' })).toThrow();
  });

  it('a bigger group gets a bigger area', () => {
    const small = world({ pattern: 'grid', count: 12 }).places[0];
    const big = world({ pattern: 'grid', count: 60 }).places[0];
    expect(placeRadius(big)).toBeGreaterThan(placeRadius(small));
  });
});

describe('grid (city blocks)', () => {
  it('fills a street grid with the asked number of buildings, spaced and dry', () => {
    const { buildings, streets, field, pl } = lay(world({ pattern: 'grid', count: 40, height: 'tall', centre: 'fountain' }));
    const bs = members(buildings);
    expect(bs.length).toBeGreaterThanOrEqual(34);
    expect(bs.length).toBeLessThanOrEqual(40);
    expect(minGap(bs)).toBeGreaterThanOrEqual(10);
    expect(streets.length).toBeGreaterThanOrEqual(6);
    for (const b of bs) {
      expect(field.isWater(b.x, b.z)).toBe(false);
      expect(b.maxWidth).toBeGreaterThan(0);
      expect(Math.hypot(b.x - pl.x, b.z - pl.z)).toBeLessThanOrEqual(pl.radius * 1.05);
    }
    expect(buildings.find((b) => b.kind === 'centre')?.asset).toBe('fountain');
  });

  it('"tall" puts the tallest buildings in the middle', () => {
    const { buildings, pl } = lay(world({ pattern: 'grid', count: 48, height: 'tall' }));
    const bs = members(buildings).map((b) => ({ d: Math.hypot(b.x - pl.x, b.z - pl.z), h: b.height! }));
    bs.sort((a, b) => a.d - b.d);
    const inner = bs.slice(0, 8), outer = bs.slice(-8);
    const avg = (xs: typeof bs) => xs.reduce((s, x) => s + x.h, 0) / xs.length;
    expect(avg(inner)).toBeGreaterThan(avg(outer) * 1.5);
    expect(Math.max(...bs.map((b) => b.h))).toBeGreaterThanOrEqual(25);
  });
});

describe('ring, line and scatter', () => {
  it('ring: members sit on a circle around the centre piece and face it', () => {
    const { buildings } = lay(world({ pattern: 'ring', count: 10, centre: 'campfire' }, 'canvas tent', 'medium'));
    const centre = buildings.find((b) => b.kind === 'centre')!;
    expect(centre.asset).toBe('campfire');
    expect(centre.interaction).toBe('fire');
    const ds = members(buildings).map((b) => Math.hypot(b.x - centre.x, b.z - centre.z));
    expect(ds.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...ds) - Math.min(...ds)).toBeLessThan(2);
  });

  it('line: members stand along one street', () => {
    const { buildings, spine } = lay(world({ pattern: 'line', count: 12 }, 'fishing shed', 'medium'));
    const [a, b] = spine.points;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const off = (p: { x: number; z: number }) => Math.abs(((b.x - a.x) * (a.z - p.z) - (a.x - p.x) * (b.z - a.z)) / len);
    const bs = members(buildings);
    expect(bs.length).toBeGreaterThanOrEqual(10);
    for (const m of bs) expect(off(m)).toBeLessThan(12);
  });

  it('scatter: loose, spaced, every member turned its own way', () => {
    const { buildings } = lay(world({ pattern: 'scatter', count: 16 }, 'apple tree', 'medium'));
    const bs = members(buildings);
    expect(bs.length).toBeGreaterThanOrEqual(12);
    expect(minGap(bs)).toBeGreaterThanOrEqual(8);
    expect(new Set(bs.map((b) => b.rotation.toFixed(2))).size).toBeGreaterThan(bs.length / 2);
  });

  it('is deterministic and the whole world builds with streets as roads', () => {
    const r = world({ pattern: 'grid', count: 30, height: 'mixed' });
    expect(lay(r).buildings).toEqual(lay(r).buildings);
    const built = buildWorld(r);
    expect(built.buildings.length).toBeGreaterThanOrEqual(25);
    expect(built.roads.length).toBeGreaterThanOrEqual(6);
  });
});
