import { describe, expect, it } from 'vitest';
import { clockPace, TIME_HOURS, hazeFor } from '../../src/render/atmosphere';
import { starVisibility } from '../../src/render/nightSky';

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

describe('clear weather', () => {
  it('drops fog left over from earlier weather', () => {
    expect(hazeFor({ time: 'day', weather: 'clear', fog: 0.55, wind: 0.3 })).toBeLessThanOrEqual(0.15);
  });
  it('keeps a light haze the AI asked for', () => {
    expect(hazeFor({ time: 'day', weather: 'clear', fog: 0.1, wind: 0.3 })).toBe(0.1);
  });
  it('leaves other weather as asked', () => {
    expect(hazeFor({ time: 'dawn', weather: 'mist', fog: 0.6, wind: 0.3 })).toBe(0.6);
  });
});

describe('starVisibility', () => {
  it('shows no stars by day', () => {
    expect(starVisibility(0, 'clear')).toBe(0);
  });
  it('shows them all on a clear night', () => {
    expect(starVisibility(1, 'clear')).toBe(1);
  });
  it('dims them in mist and hides them behind cloud or snow', () => {
    expect(starVisibility(1, 'mist')).toBeGreaterThan(0);
    expect(starVisibility(1, 'mist')).toBeLessThan(1);
    for (const w of ['rain', 'snow', 'storm'] as const) expect(starVisibility(1, w)).toBe(0);
  });
});
