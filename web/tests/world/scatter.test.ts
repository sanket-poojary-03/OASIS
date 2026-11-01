import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { scatterChunk } from '../../src/world/scatter';
import { loadRecipeFixture } from '../fixtures';

describe('scatter', () => {
  it('is deterministic, stays in the chunk, avoids water and reserved ground', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const village = solvePlacements(r, field).find((p) => p.id === 'village')!;
    const cx = Math.floor(village.x / 64), cz = Math.floor(village.z / 64);
    const a = scatterChunk(field, cx, cz), b = scatterChunk(field, cx, cz);
    expect(a).toEqual(b);
    for (const it of a) {
      expect(it.x).toBeGreaterThanOrEqual(cx * 64);
      expect(it.x).toBeLessThan(cx * 64 + 64);
      expect(field.isWater(it.x, it.z)).toBe(false);
      expect(field.isReserved(it.x, it.z, 2)).toBe(false);
    }
    let total = 0;
    for (let i = -2; i <= 2; i++) total += scatterChunk(field, i, 3).length;
    expect(total).toBeGreaterThan(20);
  });
});
