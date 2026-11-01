import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { layoutSettlement } from '../../src/world/settlement';
import { loadRecipeFixture } from '../fixtures';

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
});
