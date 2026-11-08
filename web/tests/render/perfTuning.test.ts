import { describe, expect, it } from 'vitest';
import { chunkWorkers, isLowTier, VIEW_RADIUS, SHADOW_MAP_SIZE } from '../../src/render/deviceTier';
import { COLLIDER_BUDGET, pickColliderBuilds } from '../../src/render/colliderBudget';

describe('device tier', () => {
  it('is low for narrow screens or <= 4 cores', () => {
    expect(isLowTier({ narrow: true, cores: 16 })).toBe(true);
    expect(isLowTier({ narrow: false, cores: 4 })).toBe(true);
    expect(isLowTier({ narrow: false, cores: 8 })).toBe(false);
    expect(isLowTier({ narrow: false, cores: undefined })).toBe(false);
  });
  it('is the high tier under node', () => {
    expect(VIEW_RADIUS).toBe(3);
    expect(SHADOW_MAP_SIZE).toBe(2048);
  });
});

describe('land builders', () => {
  it('leaves two cores free, and always has at least one builder and at most four', () => {
    expect(chunkWorkers(2)).toBe(1);
    expect(chunkWorkers(4)).toBe(2);
    expect(chunkWorkers(8)).toBe(4);
    expect(chunkWorkers(32)).toBe(4);
    expect(chunkWorkers(undefined)).toBe(2);
  });
});

describe('collider budget', () => {
  it('builds the nearest first and respects the budget', () => {
    const c = [{ key: 'a', dist: 4 }, { key: 'b', dist: 0 }, { key: 'c', dist: 1 }, { key: 'd', dist: 1 }];
    expect(pickColliderBuilds(c)).toEqual(['b', 'c']);
    expect(pickColliderBuilds(c, 3)).toEqual(['b', 'c', 'd']);
    expect(pickColliderBuilds(c, 0)).toEqual([]);
    expect(COLLIDER_BUDGET).toBe(2);
  });
});
