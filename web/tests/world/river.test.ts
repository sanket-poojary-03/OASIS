import { describe, expect, it } from 'vitest';
import { SegmentIndex, segmentDistance, traceRiver } from '../../src/world/river';

describe('traceRiver', () => {
  it('flows downhill to the sea on a tilted plane', () => {
    const res = traceRiver((x) => -x * 0.1, { x: 0, z: 0 }, { seaLevelY: -30, bound: 500 });
    expect(res.lake).toBeNull();
    const last = res.path[res.path.length - 1];
    expect(last.x).toBeGreaterThan(290);
    for (let i = 1; i < res.path.length; i++) expect(res.path[i].x).toBeGreaterThan(res.path[i - 1].x - 0.001);
  });

  it('forms a lake at the bottom of a bowl', () => {
    const res = traceRiver((x, z) => (x * x + z * z) * 0.01, { x: 100, z: 0 }, { seaLevelY: -100, bound: 500 });
    expect(res.lake).not.toBeNull();
    expect(Math.hypot(res.lake!.x, res.lake!.z)).toBeLessThan(10);
  });

  it('stops at the bound', () => {
    const res = traceRiver((x) => -x, { x: 0, z: 0 }, { seaLevelY: -1e9, bound: 100 });
    expect(Math.abs(res.path[res.path.length - 1].x)).toBeLessThanOrEqual(108);
  });
});

describe('SegmentIndex', () => {
  it('measures distance to a polyline', () => {
    expect(segmentDistance(0, 10, { x: -50, z: 0 }, { x: 50, z: 0 })).toBeCloseTo(10);
    const idx = new SegmentIndex(32);
    idx.addPolyline([{ x: -50, z: 0 }, { x: 50, z: 0 }, { x: 50, z: 80 }]);
    expect(idx.distance(0, 10)).toBeCloseTo(10);
    expect(idx.distance(60, 40)).toBeCloseTo(10);
    expect(idx.distance(1000, 1000)).toBe(Infinity);
  });
});
