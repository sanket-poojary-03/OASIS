import { describe, expect, it } from 'vitest';
import { applyOps, describeOps, OpError, opsSchema } from '../../src/core/ops';
import { loadOpsFixture, loadRecipeFixture } from '../fixtures';

describe('ops', () => {
  it('fixture ops parse', () => {
    expect(opsSchema.parse(loadOpsFixture('add-lighthouse-at')).length).toBe(2);
    expect(opsSchema.parse(loadOpsFixture('make-winter')).length).toBe(2);
  });

  it('addPlace + setAtmosphere', () => {
    const r = loadRecipeFixture('fishing-valley');
    const res = applyOps(r, opsSchema.parse(loadOpsFixture('add-lighthouse-at')));
    expect(res.recipe.places.map((p) => p.id)).toContain('beacon');
    expect(res.recipe.atmosphere.time).toBe('night');
    expect(res.changedPlaces.has('beacon')).toBe(true);
    expect(res.terrainChanged).toBe(false);
    expect(res.atmosphereChanged).toBe(true);
    expect(r.places.length).toBe(3); // input not mutated
  });

  it('setClimate marks terrain changed', () => {
    const res = applyOps(loadRecipeFixture('fishing-valley'), opsSchema.parse(loadOpsFixture('make-winter')));
    expect(res.terrainChanged).toBe(true);
    expect(res.recipe.climate.temperature).toBe(0.1);
  });

  it('removePlace drops paths and relations that reference it', () => {
    const res = applyOps(loadRecipeFixture('fishing-valley'), [{ op: 'removePlace', id: 'village' }]);
    expect(res.recipe.places.map((p) => p.id)).toEqual(['tower', 'campfire']);
    expect(res.recipe.paths).toEqual([]);
    expect(res.recipe.places[0].where).toEqual([{ rel: 'highest' }]);
    expect(res.removedPlaces.has('village')).toBe(true);
  });

  it('throws OpError on unknown id and duplicate id', () => {
    const r = loadRecipeFixture('fishing-valley');
    expect(() => applyOps(r, [{ op: 'removePlace', id: 'ghost' }])).toThrow(OpError);
    expect(() => applyOps(r, [{ op: 'addPlace', place: { ...r.places[0] } }])).toThrow(OpError);
  });

  it('describeOps gives plain language', () => {
    const lines = describeOps(opsSchema.parse(loadOpsFixture('add-lighthouse-at')));
    expect(lines[0]).toContain('Beacon tower');
    expect(lines[1]).toContain('night');
  });
});
