import { describe, expect, it } from 'vitest';
import { fallbackStep, FLOOR_OFFSET } from '../../src/player/fallbackStep';

describe('fallbackStep', () => {
  it('moves horizontally and clamps to the analytic floor', () => {
    const h = (x: number) => x; // slope rising along +x
    const p = fallbackStep({ x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, 5, 1, h);
    expect(p.x).toBe(5);
    expect(p.y).toBeCloseTo(5 + FLOOR_OFFSET);
  });
  it('never lowers the player below its current height when above floor', () => {
    const p = fallbackStep({ x: 0, y: 50, z: 0 }, { x: 0, z: 1 }, 5, 0.5, () => 0);
    expect(p).toEqual({ x: 0, y: 50, z: 2.5 });
  });
  it('lifts a player that is below the ground', () => {
    const p = fallbackStep({ x: 0, y: -10, z: 0 }, { x: 0, z: 0 }, 5, 0.1, () => 3);
    expect(p.y).toBeCloseTo(3 + FLOOR_OFFSET);
  });
});
