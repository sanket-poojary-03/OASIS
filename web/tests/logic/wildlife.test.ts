import { describe, expect, it } from 'vitest';
import { speedOf, stepAnimal, type AnimalState } from '../../src/logic/wildlife';

const tuning = { fleeRadius: 15, walkSpeed: 1.4, fleeSpeed: 9 };
const rng = () => 0.5;

describe('stepAnimal', () => {
  it('flees when the player is close', () => {
    const s = stepAnimal({ mode: 'graze', timer: 5, heading: 0 }, { dt: 0.1, playerDist: 10, awayHeading: 2, rng, tuning });
    expect(s.mode).toBe('flee');
    expect(s.heading).toBe(2);
    expect(speedOf(s, tuning)).toBe(9);
  });
  it('flee ends in grazing; grazing ends in walking; walking ends in grazing', () => {
    let s: AnimalState = { mode: 'flee', timer: 0.05, heading: 1 };
    s = stepAnimal(s, { dt: 0.1, playerDist: 100, awayHeading: 1, rng, tuning });
    expect(s.mode).toBe('graze');
    expect(speedOf(s, tuning)).toBe(0);
    s = stepAnimal({ ...s, timer: 0.01 }, { dt: 0.1, playerDist: 100, awayHeading: 0, rng, tuning });
    expect(s.mode).toBe('walk');
    expect(speedOf(s, tuning)).toBe(1.4);
    s = stepAnimal({ ...s, timer: 0.01 }, { dt: 0.1, playerDist: 100, awayHeading: 0, rng, tuning });
    expect(s.mode).toBe('graze');
  });
  it('counts its timer down', () => {
    const s = stepAnimal({ mode: 'graze', timer: 3, heading: 0 }, { dt: 0.5, playerDist: 100, awayHeading: 0, rng, tuning });
    expect(s).toEqual({ mode: 'graze', timer: 2.5, heading: 0 });
  });
});
