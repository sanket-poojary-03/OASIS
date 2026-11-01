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

  it('valley has village buildings and two roads (spine + path)', () => {
    const w = buildWorld(loadRecipeFixture('fishing-valley'));
    expect(w.buildings.length).toBeGreaterThan(2);
    expect(w.roads.length).toBe(2);
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
