import { describe, expect, it } from 'vitest';
import { bloomFor } from '../../src/render/postfx';

describe('bloom follows the night', () => {
  it('is off in full daylight, so the bright sky near the sun never smears glare over the world', () => {
    expect(bloomFor(0)).toMatchObject({ enabled: false, strength: 0 });
  });

  it('builds up toward night for windows, lamps and fires', () => {
    const dusk = bloomFor(0.5), night = bloomFor(1);
    expect(dusk.enabled && night.enabled).toBe(true);
    expect(night.strength).toBeGreaterThan(dusk.strength);
    expect(night.strength).toBeCloseTo(0.9);
    expect(night.threshold).toBeLessThan(dusk.threshold);
  });
});
