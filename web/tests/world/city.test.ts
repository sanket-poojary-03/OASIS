import { describe, expect, it } from 'vitest';
import { parseRecipe, type Recipe } from '../../src/core/recipe';
import { computeChunk, PAVED_COLOUR } from '../../src/world/chunkData';
import { buildWorld } from '../../src/world/build';
import { restoreField, snapshotField } from '../../src/world/field';
import { MAX_LAMPS } from '../../src/world/props';
import { loadRecipeFixture } from '../fixtures';

/** A flat, dry world holding one city grid (with the given extra fields on its place). */
function city(extra: Record<string, unknown> = {}, layout: Record<string, unknown> = {}): Recipe {
  const base = loadRecipeFixture('fishing-valley');
  const parsed = parseRecipe({
    ...base,
    terrain: { shape: 'plains', roughness: 0.1, height: 0.2, seaLevel: 0 },
    water: { river: false, lake: false },
    places: [{ id: 'downtown', kind: 'settlement', label: 'Downtown', asset: 'glass skyscraper', size: 'large',
      layout: { pattern: 'grid', count: 36, height: 'tall', ...layout }, ...extra }],
    paths: [],
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.recipe;
}

describe('cities', () => {
  it('mix the layout variants into their buildings, deterministically', () => {
    const r = city({}, { variants: ['office tower', 'apartment tower'] });
    const assets = buildWorld(r).buildings.filter((b) => b.kind === 'house').map((b) => b.asset);
    expect(new Set(assets)).toEqual(new Set(['glass skyscraper', 'office tower', 'apartment tower']));
    expect(buildWorld(r).buildings.map((b) => b.asset)).toEqual(buildWorld(r).buildings.map((b) => b.asset));
    expect(() => city({}, { variants: ['a1', 'b1', 'c1', 'd1', 'e1'] })).toThrow();
    expect(() => city({}, { variants: ['x'] })).toThrow();
    expect(new Set(buildWorld(city()).buildings.filter((b) => b.kind === 'house').map((b) => b.asset))).toEqual(new Set(['glass skyscraper']));
  });

  it('pave their grid: concrete ground with no grass or trees, carried to the chunk worker', () => {
    const w = buildWorld(city());
    const pl = w.placements[0];
    expect(w.field.pavedAt(pl.x, pl.z)).toBe(1);
    expect(w.field.pavedAt(pl.x + 400, pl.z + 400)).toBe(0);
    const f = restoreField(snapshotField(w.field));
    expect(f.pavedAt(pl.x + 5, pl.z - 7)).toBe(w.field.pavedAt(pl.x + 5, pl.z - 7));
    const cx = Math.floor(pl.x / 64), cz = Math.floor(pl.z / 64);
    const chunk = computeChunk(f, cx, cz);
    for (let i = 0; i < chunk.grass.length; i += 5) expect(f.pavedAt(chunk.grass[i], chunk.grass[i + 2])).toBeLessThanOrEqual(0.2);
    for (const s of chunk.scatter) expect(f.pavedAt(s.x, s.z)).toBe(0);
    const k = chunk.positions.findIndex((_, i) => i % 3 === 0 && f.pavedAt(chunk.positions[i], chunk.positions[i + 2]) === 1);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(chunk.colors[k]).toBeCloseTo(PAVED_COLOUR[0], 1);
  });

  it('light their crossings with street lamps (the AI’s own lamp when it named one) and line their kerbs with props', () => {
    const plain = buildWorld(city());
    const lamps = plain.extras.filter((e) => e.id.includes('-lamp-'));
    expect(lamps.length).toBeGreaterThan(10);
    expect(lamps.length).toBeLessThanOrEqual(MAX_LAMPS);
    expect(new Set(lamps.map((e) => e.asset))).toEqual(new Set(['street lamp']));
    const r = city({ props: [{ asset: 'neon street light', count: 2, size: 'large' }, { asset: 'metal bench', count: 3, size: 'small' },
      { asset: 'parked taxi car', count: 2, size: 'large' }] });
    const w = buildWorld(r);
    expect(new Set(w.extras.filter((e) => e.id.includes('-lamp-')).map((e) => e.asset))).toEqual(new Set(['neon street light']));
    const benches = w.extras.filter((e) => e.asset === 'metal bench'), cars = w.extras.filter((e) => e.asset === 'parked taxi car');
    expect(benches.length).toBeGreaterThan(3); // twice the asked count along the streets
    expect(cars.length).toBeGreaterThan(0);
    const houses = w.buildings.filter((b) => b.kind === 'house');
    for (const e of w.extras) {
      for (const h of houses) expect(Math.hypot(h.x - e.x, h.z - e.z)).toBeGreaterThanOrEqual(h.footprint / 2 + 0.79);
    }
    expect(buildWorld(r).extras).toEqual(w.extras);
  });
});
