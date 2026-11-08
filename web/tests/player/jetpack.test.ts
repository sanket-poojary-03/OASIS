import { describe, expect, it } from 'vitest';
import { JET, Jetpack, type JetWhere } from '../../src/player/jetpack';

const run = (j: Jetpack, seconds: number, held: boolean, where: JetWhere, vy = 0) => {
  for (let t = 0; t < seconds; t += 0.01) vy = j.update(0.01, vy - (where === 'air' ? 20 * 0.01 : 0), held, where);
  return vy;
};

describe('Jetpack', () => {
  it('fires only while its key is held: falling without it is plain gravity', () => {
    const j = new Jetpack();
    const vy = run(j, 0.5, false, 'air', 7);
    expect(j.firing).toBe(false);
    expect(j.fuel).toBe(1);
    expect(vy).toBeLessThan(7);
  });

  it('holding the key in the air climbs at once, capped, and drains fuel', () => {
    const j = new Jetpack();
    expect(j.update(0.01, 0, true, 'air')).toBeGreaterThan(0);
    expect(j.firing).toBe(true);
    const vy = run(j, 1.2, true, 'air', 7);
    expect(vy).toBeGreaterThan(0);
    expect(vy).toBeLessThanOrEqual(JET.maxUp);
    expect(j.fuel).toBeLessThan(1);
  });

  it('holding the key on the ground lifts off', () => {
    const j = new Jetpack();
    expect(j.update(0.01, -1, true, 'ground')).toBeGreaterThanOrEqual(JET.liftOff);
    expect(j.firing).toBe(true);
  });

  it('an empty tank stops thrust; the ground refills it', () => {
    const j = new Jetpack();
    run(j, 5, true, 'air');
    expect(j.fuel).toBe(0);
    expect(j.firing).toBe(false);
    run(j, 3, false, 'ground');
    expect(j.fuel).toBe(1);
  });

  it('a key held on an empty tank does not hop on the trickle of refilled fuel; letting go re-arms it', () => {
    const j = new Jetpack();
    run(j, 5, true, 'air');
    run(j, 1, true, 'ground', -1);
    expect(j.firing).toBe(false);
    expect(j.fuel).toBeGreaterThan(0);
    run(j, 0.02, false, 'ground', -1);
    j.update(0.01, -1, true, 'ground');
    expect(j.firing).toBe(true);
  });

  it('no thrust while swimming', () => {
    const j = new Jetpack();
    expect(j.update(0.1, 0, true, 'water')).toBe(0);
    expect(j.firing).toBe(false);
  });
});
