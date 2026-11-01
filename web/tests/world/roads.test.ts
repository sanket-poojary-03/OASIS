import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { chaikin, findPath } from '../../src/world/roads';
import { loadRecipeFixture } from '../fixtures';

describe('roads', () => {
  it('chaikin keeps endpoints and adds points', () => {
    const out = chaikin([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], 2);
    expect(out[0]).toEqual({ x: 0, z: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, z: 10 });
    expect(out.length).toBeGreaterThan(3);
  });

  it('connects two placements on the valley', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pls = solvePlacements(r, field);
    const v = pls.find((p) => p.id === 'village')!, t = pls.find((p) => p.id === 'tower')!;
    const road = findPath(field, v, t);
    expect(road).not.toBeNull();
    const pts = road!.points;
    expect(Math.hypot(pts[0].x - v.x, pts[0].z - v.z)).toBeLessThan(12);
    expect(Math.hypot(pts[pts.length - 1].x - t.x, pts[pts.length - 1].z - t.z)).toBeLessThan(12);
    expect(road!.bridges.length).toBe(pts.length - 1);
    expect(road!.width).toBe(4);
  });
});
