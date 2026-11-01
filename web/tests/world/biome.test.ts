import { describe, expect, it } from 'vitest';
import { classifyBiome, type BiomeSample } from '../../src/world/biome';

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
