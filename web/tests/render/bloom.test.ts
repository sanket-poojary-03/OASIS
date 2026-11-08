import { describe, expect, it } from 'vitest';
import { bloomFor } from '../../src/render/postfx';

describe('bloom follows the night', () => {
  it('is off in full daylight, so the bright sky near the sun never smears glare over the world', () => {
    expect(bloomFor(0)).toMatchObject({ enabled: false, strength: 0 });
  });

  it('stays off while the sun is up: at dusk it spread the sky around the sun over the whole picture', () => {
    expect(bloomFor(0.22).enabled).toBe(false); // the clock at "dusk", 17.4 h
    expect(bloomFor(0.5).enabled).toBe(false);
  });

  it('builds up in the dark for windows, lamps and fires', () => {
    const evening = bloomFor(0.75), night = bloomFor(1);
    expect(evening.enabled && night.enabled).toBe(true);
    expect(night.strength).toBeGreaterThan(evening.strength);
    expect(night.strength).toBeLessThan(0.6); // a lit city must keep its buildings: at 0.9 they washed out to white
    expect(night.threshold).toBeLessThan(evening.threshold);
  });
});
