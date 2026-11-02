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

describe('ribbon winding', () => {
  it('triangle normals face +y', () => {
    const r = ribbonData([{ x: 0, z: 0 }, { x: 10, z: 0 }], 2, () => 0);
    for (let t = 0; t < r.indices.length; t += 3) {
      const v = (n: number) => r.positions.slice(r.indices[t + n] * 3, r.indices[t + n] * 3 + 3);
      const [a, b, c] = [v(0), v(1), v(2)];
      const e1 = [b[0] - a[0], b[2] - a[2]], e2 = [c[0] - a[0], c[2] - a[2]];
      expect(e1[1] * e2[0] - e1[0] * e2[1]).toBeGreaterThan(0);
    }
  });
});
