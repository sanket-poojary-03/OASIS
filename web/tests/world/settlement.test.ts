import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/core/recipe';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { footprintSamples, layoutSettlement, MIN_HOUSE_SPACING, SITE_SLOPE_MAX } from '../../src/world/settlement';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('settlement', () => {
  it('lays out a dry, non-overlapping village inside its radius', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pl = solvePlacements(r, field).find((p) => p.id === 'village')!;
    const place = r.places.find((p) => p.id === 'village')!;
    const { buildings, spine } = layoutSettlement(place, pl, field, r.seed);
    expect(buildings.length).toBeGreaterThanOrEqual(3);
    expect(buildings.length).toBeLessThanOrEqual(7);
    expect(buildings.filter((b) => b.kind === 'well').length).toBe(1);
    for (const b of buildings) {
      expect(field.isWater(b.x, b.z)).toBe(false);
      expect(Math.hypot(b.x - pl.x, b.z - pl.z)).toBeLessThanOrEqual(pl.radius * 1.05);
      expect(b.y).toBeCloseTo(field.heightAt(b.x, b.z), 5);
    }
    for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
      expect(Math.hypot(buildings[i].x - buildings[j].x, buildings[i].z - buildings[j].z)).toBeGreaterThanOrEqual(6);
    }
    expect(spine.points.length).toBe(2);
    expect(buildings.filter((b) => b.kind === 'house').every((b) => b.interaction === 'door')).toBe(true);
  });

  // Snowy-mountains has no settlement in its recipe, so a village is added for the solver to place.
  const withVillage = (r: Recipe): Recipe => (r.places.some((p) => p.kind === 'settlement') ? r : {
    ...r,
    places: [...r.places, { id: 'village', kind: 'settlement', label: 'Village', asset: 'cottage', size: 'medium', interaction: 'none', where: [] }],
  });

  for (const name of RECIPE_FIXTURES) {
    it(`keeps every building dry, on gentle ground and inside the radius (${name})`, () => {
      const r = withVillage(loadRecipeFixture(name));
      const field = createField(r);
      const pl = solvePlacements(r, field).find((p) => p.kind === 'settlement')!;
      const place = r.places.find((p) => p.id === pl.id)!;
      const { buildings, spine } = layoutSettlement(place, pl, field, r.seed);

      expect(buildings.filter((b) => b.kind !== 'house').length).toBe(1);
      expect(buildings.filter((b) => b.kind === 'well' || b.kind === 'market').length).toBe(1);
      expect(spine.points.length).toBe(2);
      for (const b of buildings) {
        for (const s of footprintSamples(b.x, b.z, b.footprint)) {
          expect(field.isWater(s.x, s.z)).toBe(false);
          expect(field.slopeAt(s.x, s.z)).toBeLessThanOrEqual(SITE_SLOPE_MAX);
        }
        expect(Math.hypot(b.x - pl.x, b.z - pl.z)).toBeLessThanOrEqual(pl.radius);
      }
      for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
        const d = Math.hypot(buildings[i].x - buildings[j].x, buildings[i].z - buildings[j].z);
        expect(d).toBeGreaterThanOrEqual(MIN_HOUSE_SPACING);
      }
    });
  }

  it('is deterministic for the same recipe', () => {
    const run = () => {
      const r = loadRecipeFixture('tropical-island');
      const field = createField(r);
      const pl = solvePlacements(r, field).find((p) => p.kind === 'settlement')!;
      const place = r.places.find((p) => p.id === pl.id)!;
      return layoutSettlement(place, pl, field, r.seed);
    };
    expect(run()).toEqual(run());
  });
});
