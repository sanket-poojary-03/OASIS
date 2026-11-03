import { describe, expect, it } from 'vitest';
import { JET, Jetpack } from '../../src/player/jetpack';

const run = (j: Jetpack, seconds: number, held: boolean, airborne: boolean, vy = 0) => {
  for (let t = 0; t < seconds; t += 0.01) vy = j.update(0.01, vy - (airborne ? 20 * 0.01 : 0), held, airborne);
  return vy;
};

describe('Jetpack', () => {
  it('a quick tap is a plain jump: no thrust in the first moment of air time', () => {
    const j = new Jetpack();
    run(j, JET.holdDelay * 0.8, true, true, 7);
    expect(j.firing).toBe(false);
    expect(j.fuel).toBe(1);
  });

  it('holding Space in the air climbs, capped, and drains fuel', () => {
    const j = new Jetpack();
    const vy = run(j, 1.2, true, true, 7);
    expect(j.firing).toBe(true);
    expect(vy).toBeGreaterThan(0);
    expect(vy).toBeLessThanOrEqual(JET.maxUp);
    expect(j.fuel).toBeLessThan(1);
  });

  it('an empty tank stops thrust; the ground refills it', () => {
    const j = new Jetpack();
    run(j, 5, true, true);
    expect(j.fuel).toBe(0);
    expect(j.firing).toBe(false);
    run(j, 3, false, false);
    expect(j.fuel).toBe(1);
  });

  it('no thrust on the ground or while swimming (not airborne)', () => {
    const j = new Jetpack();
    expect(j.update(0.1, 0, true, false)).toBe(0);
    expect(j.firing).toBe(false);
  });
});
