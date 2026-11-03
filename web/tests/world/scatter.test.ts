import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { groveTree, scatterChunk, scatterRules } from '../../src/world/scatter';
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

  it('is diverse: several kinds, ground cover and model variants in a forest valley', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    const items = [];
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) items.push(...scatterChunk(field, x, z));
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(6);
    expect([...kinds].some((k) => ['flowers', 'fern', 'mushroom', 'log', 'stump', 'pebble'].includes(k))).toBe(true);
    const trees = items.filter((i) => i.kind === 'tree' || i.kind === 'pine');
    expect(new Set(trees.map((t) => t.variant)).size).toBeGreaterThan(3);
  });

  it('groves: a slow noise picks oak, birch or autumn trees', () => {
    expect(groveTree(0.5)).toBe('birch');
    expect(groveTree(-0.5)).toBe('autumn_tree');
    expect(groveTree(0)).toBe('tree');
    expect(scatterRules('sand', 0, 0.8).map(([k]) => k)).toContain('palm'); // warm beaches grow palms
    expect(scatterRules('sand', 0, 0.3).map(([k]) => k)).not.toContain('palm');
  });

  it('is independent of generation order', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    const first = scatterChunk(field, 1, 3);
    for (const [x, z] of [[0, 0], [2, 3], [-1, 5], [1, 2]]) scatterChunk(field, x, z);
    expect(scatterChunk(field, 1, 3)).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it('excludes cells covered by a pad (exclusion is actually exercised)', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    const cx = 1, cz = 3;
    const px = cx * 64 + 32, pz = cz * 64 + 32;
    const near = (it: { x: number; z: number }) => Math.hypot(it.x - px, it.z - pz) < 22;
    const before = scatterChunk(field, cx, cz);
    expect(before.filter(near).length).toBeGreaterThan(0);
    field.addPad({ x: px, z: pz, radius: 20, y: field.heightAt(px, pz) });
    const after = scatterChunk(field, cx, cz);
    expect(after.filter(near)).toEqual([]);
    expect(after.length).toBeLessThan(before.length);
  });

  it('keeps clear of roads', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    const cx = 1, cz = 3;
    const before = scatterChunk(field, cx, cz);
    const z0 = cz * 64 + 32;
    const nearRoad = (it: { z: number }) => Math.abs(it.z - z0) < 4;
    expect(before.filter(nearRoad).length).toBeGreaterThan(0);
    field.addRoad({ points: [{ x: cx * 64 - 10, z: z0 }, { x: cx * 64 + 74, z: z0 }], width: 4, bridges: [false, false] });
    const after = scatterChunk(field, cx, cz);
    for (const it of after) expect(field.isReserved(it.x, it.z, 2)).toBe(false);
    expect(after.filter((it) => Math.abs(it.z - z0) < 3.9)).toEqual([]);
    expect(after.length).toBeLessThan(before.length);
  });

  it('only places non-rock items (pebbles count as rock) on gentle slopes', () => {
    const field = createField(loadRecipeFixture('snowy-mountains'));
    let checked = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      for (const it of scatterChunk(field, x, z)) {
        if (it.kind === 'rock' || it.kind === 'pebble') continue;
        expect(field.slopeAt(it.x, it.z)).toBeLessThanOrEqual(0.6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
