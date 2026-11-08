import { describe, expect, it } from 'vitest';
import { applyOps, describeOps, OpError, opsSchema } from '../../src/core/ops';
import { MAX_PLACES } from '../../src/core/recipe';
import { loadOpsFixture, loadRecipeFixture } from '../fixtures';

describe('ops', () => {
  it('fixture ops parse', () => {
    expect(opsSchema.parse(loadOpsFixture('add-lighthouse-at')).length).toBe(2);
    expect(opsSchema.parse(loadOpsFixture('make-winter')).length).toBe(2);
    expect(opsSchema.parse(loadOpsFixture('red-planet')).length).toBe(2);
    expect(opsSchema.parse(loadOpsFixture('sized-plane')).length).toBe(1);
  });

  it('setPalette recolours without rebuilding terrain, keeps unnamed colours, and rejects non-hex', () => {
    const r = { ...loadRecipeFixture('fishing-valley'), palette: { water: '#40e0d0' } };
    const res = applyOps(r, opsSchema.parse(loadOpsFixture('red-planet')));
    expect(res.recipe.palette).toEqual({ ground: '#a8442a', sky: '#e0a080', water: '#40e0d0' });
    expect(res.terrainChanged).toBe(false);
    expect(describeOps(opsSchema.parse(loadOpsFixture('red-planet')))[0]).toMatch(/ground #a8442a.*sky #e0a080/);
    expect(opsSchema.safeParse([{ op: 'setPalette', ground: 'red' }]).success).toBe(false);
    expect(opsSchema.safeParse([{ op: 'setPalette', ground: '#a8442a', grass: '#00ff00' }]).success).toBe(false);
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

  it('one place past the limit gives a friendly message, not a raw schema error (m8)', () => {
    const r = loadRecipeFixture('fishing-valley');
    const full = { ...r, places: Array.from({ length: MAX_PLACES }, (_, i) => ({ ...r.places[0], id: `spot-${i}`, where: [{ rel: 'flat' as const }] })), paths: [] };
    const add = { op: 'addPlace' as const, place: { ...r.places[0], id: 'one-more', where: [{ rel: 'flat' as const }] } };
    expect(() => applyOps(full, [add])).toThrow(`This world already has ${MAX_PLACES} places — remove one first.`);
    expect(applyOps(full, [{ op: 'removePlace', id: 'spot-0' }, add]).recipe.places).toHaveLength(MAX_PLACES); // remove then add is fine
  });

  it('a place keeps the height it was given, and updatePlace can change it ("make the statue bigger")', () => {
    const r = loadRecipeFixture('fishing-valley');
    const added = applyOps(r, opsSchema.parse(loadOpsFixture('sized-plane')));
    expect(added.recipe.places.find((p) => p.id === 'plane')!.height).toBe(3);
    const grown = applyOps(added.recipe, opsSchema.parse([{ op: 'updatePlace', id: 'plane', height: 4.5 }]));
    expect(grown.recipe.places.find((p) => p.id === 'plane')!.height).toBe(4.5);
    expect(grown.changedPlaces.has('plane')).toBe(true);
  });

  it('heights have hard limits the backend clamps into: places up to 1000 m, animals up to 15 m', () => {
    const place = (height: number) => [{ op: 'addPlace', place: { id: 'xx', kind: 'prop', label: 'X', asset: 'xx', height } }];
    expect(opsSchema.safeParse(place(1000)).success).toBe(true);
    expect(opsSchema.safeParse(place(1001)).success).toBe(false);
    const life = (height: number) => [{ op: 'addLife', kind: 'animal', asset: 'dragon', count: 1, height }];
    expect(opsSchema.safeParse(life(15)).success).toBe(true);
    expect(opsSchema.safeParse(life(16)).success).toBe(false);
  });
});
