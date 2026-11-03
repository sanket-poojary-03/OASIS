import { describe, expect, it } from 'vitest';
import { BIOME_COLOR, classifyBiome, groundColor, hexToRgb, type BiomeSample } from '../../src/world/biome';

const base: BiomeSample = { height01: 0.1, slope: 0.1, temperature: 0.6, moisture: 0.5, nearWater: false, nearSea: false };

describe('classifyBiome', () => {
  it.each([
    [{ slope: 0.9 }, 'rock'],
    [{ nearSea: true }, 'sand'],
    [{ height01: 0.95, temperature: 0.3 }, 'snow'],
    [{ height01: 0.4, temperature: 0.4 }, 'pine'],
    [{ temperature: 0.9, moisture: 0.1 }, 'desert'],
    [{ temperature: 0.4, moisture: 0.1 }, 'grass'],
    [{ moisture: 0.7, nearWater: true }, 'marsh'],
    [{ moisture: 0.55 }, 'forest'],
    [{ moisture: 0.35 }, 'grass'],
  ] as const)('%o → %s', (patch, expected) => {
    expect(classifyBiome({ ...base, ...patch })).toBe(expected);
  });
});

describe('ground palette', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb('#FF8000')).toEqual([1, 128 / 255, 0]);
  });
  it('keeps the biome colour when no ground colour is given', () => {
    expect(groundColor('grass', undefined)).toBe(BIOME_COLOR.grass);
  });
  it('pulls every biome toward the ground colour but keeps light and dark biomes apart', () => {
    const red = hexToRgb('#a8442a');
    const luma = ([r, g, b]: readonly number[]) => 0.3 * r + 0.59 * g + 0.11 * b;
    for (const b of ['grass', 'forest', 'sand', 'rock', 'snow'] as const) {
      const [r, g, bl] = groundColor(b, red);
      expect(r).toBeGreaterThan(g); // reddish everywhere, even on grass and snow
      expect(r).toBeGreaterThan(bl);
      for (const c of [r, g, bl]) expect(c).toBeLessThanOrEqual(1);
    }
    expect(luma(groundColor('snow', red))).toBeGreaterThan(luma(groundColor('forest', red)));
    const black = hexToRgb('#000000');
    expect(luma(groundColor('snow', black))).toBeGreaterThan(luma(groundColor('forest', black))); // still varied
  });
});
