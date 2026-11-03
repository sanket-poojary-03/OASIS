import { describe, expect, it } from 'vitest';
import { clockPace, TIME_HOURS } from '../../src/render/atmosphere';

describe('clockPace', () => {
  it('lets the asked-for time last and hurries through nights nobody asked for', () => {
    expect(clockPace(TIME_HOURS.dusk, TIME_HOURS.dusk)).toBeCloseTo(1 / 3);
    expect(clockPace(18.5, TIME_HOURS.dusk)).toBeCloseTo(1 / 3);
    expect(clockPace(23, TIME_HOURS.dusk)).toBe(4);
    expect(clockPace(23.5, TIME_HOURS.night)).toBeCloseTo(1 / 3);
    expect(clockPace(2, TIME_HOURS.night)).toBe(1); // a night world keeps its night
    expect(clockPace(0.3, TIME_HOURS.night)).toBeCloseTo(1 / 3); // wraps past midnight
    expect(clockPace(15, TIME_HOURS.day)).toBe(1);
  });
});
