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

  it('shares identical edge vertices between adjacent chunks', () => {
    const field = createField(loadRecipeFixture('snowy-mountains'));
    const n = CHUNK_RES + 1;
    const a = computeChunk(field, 0, 0), east = computeChunk(field, 1, 0), south = computeChunk(field, 0, 1);
    const same = (p: Float32Array, i: number, q: Float32Array, j: number) => {
      for (let k = 0; k < 3; k++) expect(p[i * 3 + k]).toBe(q[j * 3 + k]);
    };
    for (let j = 0; j < n; j++) {
      const ia = j * n + CHUNK_RES, ib = j * n;
      for (const key of ['positions', 'normals', 'colors'] as const) same(a[key], ia, east[key], ib);
    }
    for (let i = 0; i < n; i++) {
      const ia = CHUNK_RES * n + i, ib = i;
      for (const key of ['positions', 'normals', 'colors'] as const) same(a[key], ia, south[key], ib);
    }
  });

  it('is independent of generation order', () => {
    const field = createField(loadRecipeFixture('snowy-mountains'));
    const first = computeChunk(field, 1, -2);
    for (const [x, z] of [[0, 0], [2, 3], [-1, -2], [1, -1]]) computeChunk(field, x, z);
    expect(computeChunk(field, 1, -2)).toEqual(first);
  });
});
