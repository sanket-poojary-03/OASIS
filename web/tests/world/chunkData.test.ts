import { describe, expect, it } from 'vitest';
import { CHUNK_RES, computeChunk } from '../../src/world/chunkData';
import { createField } from '../../src/world/field';
import { loadRecipeFixture } from '../fixtures';

describe('computeChunk', () => {
  it('builds a consistent grid with unit normals and matching heights', () => {
    const field = createField(loadRecipeFixture('snowy-mountains'));
    const c = computeChunk(field, 1, -2);
    const n = CHUNK_RES + 1;
    expect(c.positions.length).toBe(n * n * 3);
    expect(c.normals.length).toBe(n * n * 3);
    expect(c.colors.length).toBe(n * n * 3);
    expect(c.indices.length).toBe(CHUNK_RES * CHUNK_RES * 6);
    for (let i = 0; i < n * n; i += 37) {
      const len = Math.hypot(c.normals[i * 3], c.normals[i * 3 + 1], c.normals[i * 3 + 2]);
      expect(len).toBeCloseTo(1, 4);
      expect(c.positions[i * 3 + 1]).toBeCloseTo(field.heightAt(c.positions[i * 3], c.positions[i * 3 + 2]), 4);
    }
    expect(c.positions[0]).toBe(64);
    expect(c.positions[2]).toBe(-128);
  });
});
