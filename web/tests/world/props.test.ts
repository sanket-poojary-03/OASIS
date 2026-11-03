import { describe, expect, it } from 'vitest';
import { buildWorld } from '../../src/world/build';
import { MAX_EXTRAS } from '../../src/world/props';
import { loadRecipeFixture } from '../fixtures';

describe('scatterProps', () => {
  it('scatters the props of each place around it, deterministically, on free dry ground', () => {
    const r = loadRecipeFixture('fishing-valley'); // the village lists barrels, crates and lanterns
    const w = buildWorld(r);
    const village = w.placements.find((p) => p.id === 'village')!;
    expect(w.extras.length).toBeGreaterThan(5);
    for (const e of w.extras) {
      expect(e.placeId).toBe('village');
      expect(Math.hypot(e.x - village.x, e.z - village.z)).toBeLessThan(village.radius + 6.01);
      expect(w.field.isWater(e.x, e.z)).toBe(false);
      expect(e.y).toBeCloseTo(w.field.heightAt(e.x, e.z), 3);
    }
    for (const a of w.extras) for (const b of w.extras) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(2.5);
    expect(buildWorld(r).extras).toEqual(w.extras);
    expect(new Set(w.extras.map((e) => e.asset))).toEqual(new Set(['wooden barrel', 'wooden crate', 'street lantern']));
  });

  it('never goes past the per-world cap, and places without props have none', () => {
    const r = loadRecipeFixture('fishing-valley');
    const many = { ...r, places: r.places.map((p) => ({ ...p, props: Array.from({ length: 4 }, (_, i) => ({ asset: `thing ${i}`, count: 6, size: 'small' as const })) })) };
    expect(buildWorld(many).extras.length).toBeLessThanOrEqual(MAX_EXTRAS);
    expect(buildWorld(loadRecipeFixture('desert-canyon')).extras).toEqual([]);
  });
});
