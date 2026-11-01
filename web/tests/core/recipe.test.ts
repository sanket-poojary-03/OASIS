import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/recipe';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('recipe schema', () => {
  it.each(RECIPE_FIXTURES)('fixture %s is valid', (name) => {
    expect(loadRecipeFixture(name).version).toBe(1);
  });

  it('fills defaults (size, interaction, where, paths, life)', () => {
    const base = loadRecipeFixture('fishing-valley');
    const raw = { ...base, paths: undefined, life: undefined, places: [{ id: 'x1', kind: 'prop', label: 'X', asset: 'crate' }] };
    const res = parseRecipe(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipe.places[0].size).toBe('medium');
      expect(res.recipe.places[0].interaction).toBe('none');
      expect(res.recipe.places[0].where).toEqual([]);
      expect(res.recipe.paths).toEqual([]);
    }
  });

  it('rejects unknown fields', () => {
    const r = { ...loadRecipeFixture('fishing-valley'), extra: 1 };
    expect(parseRecipe(r).ok).toBe(false);
  });

  it('rejects dangling relation targets and path endpoints', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places[1].where = [{ rel: 'visible_from', target: 'nowhere' }];
    expect(parseRecipe(r).ok).toBe(false);
    const r2 = loadRecipeFixture('fishing-valley');
    r2.paths = [{ from: 'village', to: 'ghost' }];
    expect(parseRecipe(r2).ok).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places.push({ ...r.places[0] });
    expect(parseRecipe(r).ok).toBe(false);
  });

  it('rejects out-of-range at coordinates', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places[2].where = [{ rel: 'at', x: 9999, z: 0 }];
    expect(parseRecipe(r).ok).toBe(false);
  });
});
