import { describe, expect, it } from 'vitest';
import { CORE_HALF, type Recipe } from '../../src/core/recipe';
import { buildWorld, type BuiltWorld } from '../../src/world/build';
import { SCENERY_CELL, sceneryKinds } from '../../src/world/scenery';
import { loadRecipeFixture } from '../fixtures';

const SCENERY: NonNullable<Recipe['scenery']> = [
  { asset: 'stone shrine', kind: 'structure', size: 'small', interaction: 'none', spot: 'anywhere' },
  { asset: 'old windmill', kind: 'landmark', size: 'medium', interaction: 'none', spot: 'high' },
  { asset: 'fishing hut', kind: 'structure', size: 'small', interaction: 'door', spot: 'water' },
  { asset: 'wooden cart', kind: 'prop', size: 'medium', interaction: 'none', spot: 'anywhere' },
  { asset: 'hay bale', kind: 'prop', size: 'medium', interaction: 'none', spot: 'anywhere' },
  { asset: 'signpost', kind: 'prop', size: 'medium', interaction: 'none', spot: 'anywhere' },
];

const withScenery = (name: string): Recipe => ({ ...loadRecipeFixture(name), scenery: SCENERY });

/** Share of the core's land cells holding at least one thing the player can find. */
function coverage(w: BuiltWorld): number {
  const n = Math.round((CORE_HALF * 2) / SCENERY_CELL);
  const cell = (v: number) => Math.floor((v + CORE_HALF) / SCENERY_CELL);
  const lit = new Set<number>();
  for (const s of w.scenery) lit.add(cell(s.z) * n + cell(s.x));
  for (const p of w.placements) lit.add(cell(p.z) * n + cell(p.x));
  for (const b of w.buildings) lit.add(cell(b.z) * n + cell(b.x));
  let land = 0, covered = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -CORE_HALF + (i + 0.5) * SCENERY_CELL, z = -CORE_HALF + (j + 0.5) * SCENERY_CELL;
    if (w.field.isWater(x, z)) continue;
    land++;
    if (lit.has(j * n + i)) covered++;
  }
  return covered / land;
}

describe('scenery', () => {
  it('fills the land between the places, so most of the world has something in it', () => {
    for (const name of ['fishing-valley', 'desert-canyon', 'snowy-mountains', 'tropical-island']) {
      expect(coverage(buildWorld(withScenery(name))), name).toBeGreaterThan(0.6);
    }
  });

  it('is the same every time for the same recipe', () => {
    const r = withScenery('fishing-valley');
    expect(buildWorld(r).scenery).toEqual(buildWorld(r).scenery);
  });

  it('stands on dry ground, clear of places and roads, inside the core', () => {
    const w = buildWorld(withScenery('fishing-valley'));
    expect(w.scenery.length).toBeGreaterThan(20);
    for (const s of w.scenery) {
      expect(w.field.isWater(s.x, s.z)).toBe(false);
      expect(Math.abs(s.x)).toBeLessThan(CORE_HALF);
      expect(Math.abs(s.z)).toBeLessThan(CORE_HALF);
      for (const p of w.placements) expect(Math.hypot(p.x - s.x, p.z - s.z), `${s.id} by ${p.id}`).toBeGreaterThan(p.radius);
      for (const road of w.roads) for (const q of road.points) expect(Math.hypot(q.x - s.x, q.z - s.z), `${s.id} on a road`).toBeGreaterThan(road.width / 2);
      expect(s.y).toBeCloseTo(w.field.heightAt(s.x, s.z), 0);
    }
  });

  it('uses only what the recipe named, in good variety', () => {
    const w = buildWorld(withScenery('fishing-valley'));
    const named = new Set(SCENERY.map((s) => s.asset));
    for (const s of w.scenery) expect(named.has(s.asset)).toBe(true);
    expect(new Set(w.scenery.map((s) => s.asset)).size).toBeGreaterThan(3);
  });

  it('honours the spot: a water thing stands by the water', () => {
    const w = buildWorld(withScenery('fishing-valley'));
    for (const s of w.scenery.filter((q) => q.asset === 'fishing hut')) expect(w.field.waterDistance(s.x, s.z)).toBeLessThan(45);
  });

  it('stays put when a place is added far away, so an edit does not shuffle the world', () => {
    const r = withScenery('fishing-valley');
    const before = buildWorld(r);
    const added: Recipe = { ...r, places: [...r.places, { id: 'added', kind: 'structure', label: 'Added', asset: 'cabin', size: 'small', interaction: 'none', where: [{ rel: 'at', x: 300, z: 300 }] }] };
    const after = buildWorld(added, before.placements);
    const at = new Map(after.scenery.map((s) => [s.id, s]));
    // The new place's road gets the ground it runs over: a find in its way moves aside, as it should.
    const oldRoads = new Set(before.roads.map((road) => `${road.points[0].x},${road.points[0].z},${road.points.length}`));
    const newRoads = after.roads.filter((road) => !oldRoads.has(`${road.points[0].x},${road.points[0].z},${road.points.length}`));
    const moved = before.scenery.filter((s) => {
      if (Math.hypot(s.x - 300, s.z - 300) < 2 * SCENERY_CELL) return false;
      if (newRoads.some((road) => road.points.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < SCENERY_CELL / 2))) return false;
      const o = at.get(s.id);
      return !o || o.x !== s.x || o.z !== s.z || o.asset !== s.asset;
    });
    expect(moved).toEqual([]);
  });

  it('reproduces the terrain on a rebuild that keeps every placement (undo)', () => {
    const r = withScenery('fishing-valley');
    const a = buildWorld(r);
    const b = buildWorld(r, a.placements);
    expect(b.field.pads).toEqual(a.field.pads);
    expect(b.scenery).toEqual(a.scenery);
  });

  it('falls back to the small things the AI gave its places, leaving lamps and vehicles in town', () => {
    const { scenery: _named, ...r } = loadRecipeFixture('fishing-valley');
    const assets = sceneryKinds(r).map((s) => s.asset);
    expect(assets).toContain('wooden barrel');
    expect(assets).not.toContain('street lantern');
  });

  it('is empty when the recipe names nothing to scatter', () => {
    const { scenery: _named, ...r } = loadRecipeFixture('fishing-valley');
    expect(buildWorld({ ...r, places: [], paths: [] }).scenery).toEqual([]);
  });

  it('floats on decks in an ocean, on every other cell', () => {
    const r: Recipe = { ...withScenery('fishing-valley'), terrain: { shape: 'ocean', roughness: 0.3, height: 0.3, seaLevel: 0.6 }, water: { river: false, lake: false } };
    const w = buildWorld(r);
    expect(w.scenery.length).toBeGreaterThan(5);
    for (const s of w.scenery) expect(s.y).toBeCloseTo(w.field.deckY!, 3);
  });
});
