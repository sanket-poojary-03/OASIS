import { createNoise2D } from 'simplex-noise';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/rng';
import { clamp, fbm, ridged, smoothstep } from '../../src/world/noise';

describe('noise', () => {
  const n = createNoise2D(mulberry32(1));
  it('fbm stays in [-1, 1] and ridged in [0, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.37, z = i * 0.91;
      const f = fbm(n, x, z, 5, 0.5);
      const r = ridged(n, x, z, 5);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
  it('smoothstep and clamp', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 15)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});
