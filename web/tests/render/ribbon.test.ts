import { describe, expect, it } from 'vitest';
import { ribbonData } from '../../src/render/ribbon';

describe('ribbonData', () => {
  const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
  const r = ribbonData(pts, 2, (x) => x / 10);
  it('has two vertices per point and two triangles per segment', () => {
    expect(r.positions.length).toBe(pts.length * 2 * 3);
    expect(r.indices.length).toBe((pts.length - 1) * 6);
  });
  it('offsets left/right perpendicular to travel by halfWidth', () => {
    expect(r.positions.slice(0, 6)).toEqual([0, 0, 2, 0, 0, -2]);
  });
  it('takes y from yAt', () => {
    expect(r.positions[7]).toBe(1);
    expect(r.positions[13]).toBe(2);
  });
});
