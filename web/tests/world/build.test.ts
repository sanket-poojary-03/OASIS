import { describe, expect, it } from 'vitest';
import { applyOps } from '../../src/core/ops';
import { buildWorld } from '../../src/world/build';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('buildWorld', () => {
  it.each(RECIPE_FIXTURES)('%s builds with no failing checks', (name) => {
    const w = buildWorld(loadRecipeFixture(name));
    expect(w.placements.length).toBe(w.recipe.places.length);
    expect(w.field.isWater(w.spawn.x, w.spawn.z)).toBe(false);
    expect(w.checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(w.log.length).toBeGreaterThan(2);
  });

  it('valley has village buildings, and roads reach every place and the spawn (one network)', () => {
    for (const name of ['fishing-valley', 'desert-canyon', 'snowy-mountains', 'tropical-island'] as const) {
      const w = buildWorld(loadRecipeFixture(name));
      if (name === 'fishing-valley') expect(w.buildings.length).toBeGreaterThan(2);
      const near = (x: number, z: number) => Math.min(...w.roads.flatMap((r) => r.points.map((p) => Math.hypot(p.x - x, p.z - z))));
      for (const p of w.placements) {
        if (w.recipe.places.find((q) => q.id === p.id)?.kind === 'prop') continue;
        expect(near(p.x, p.z), `${name}: ${p.id}`).toBeLessThan(15);
      }
      expect(near(w.spawn.x, w.spawn.z), `${name}: spawn`).toBeLessThan(15);
    }
  });

  it('keeps unchanged placements across an edit', () => {
    const r = loadRecipeFixture('fishing-valley');
    const before = buildWorld(r);
    const { recipe } = applyOps(r, [{ op: 'addPlace', place: { id: 'shrine', kind: 'structure', label: 'Shrine', asset: 'small stone shrine', size: 'small', interaction: 'sound', where: [{ rel: 'near', target: 'tower', maxDist: 40 }] } }]);
    const after = buildWorld(recipe, before.placements);
    for (const id of ['village', 'tower', 'campfire']) {
      const a = before.placements.find((p) => p.id === id)!, b = after.placements.find((p) => p.id === id)!;
      expect(b.x).toBe(a.x);
      expect(b.z).toBe(a.z);
    }
    expect(after.placements.find((p) => p.id === 'shrine')).toBeDefined();
  });
});
