import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from '../../src/core/rng';

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('hashString is stable and spreads', () => {
    expect(hashString('village')).toBe(hashString('village'));
    expect(hashString('village')).not.toBe(hashString('tower'));
  });
});
