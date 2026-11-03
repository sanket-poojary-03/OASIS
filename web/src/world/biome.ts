import type { WorldField } from './field';
import { clamp, smoothstep } from './noise';

export type Biome = 'sand' | 'grass' | 'forest' | 'pine' | 'snow' | 'rock' | 'desert' | 'marsh';

export interface BiomeSample {
  height01: number;
  slope: number;
  temperature: number;
  moisture: number;
  nearWater: boolean;
  nearSea: boolean;
}

export function classifyBiome(s: BiomeSample): Biome {
  if (s.slope > 0.75) return 'rock';
  if (s.nearSea) return 'sand';
  const t = s.temperature - s.height01 * 0.55;
  const m = s.moisture + (s.nearWater ? 0.2 : 0);
  if (t < 0.05) return 'snow';
  if (t < 0.2) return 'pine';
  if (m < 0.25) return t > 0.55 ? 'desert' : 'grass';
  if (m > 0.75 && s.nearWater) return 'marsh';
  if (m > 0.45) return 'forest';
  return 'grass';
}

export function biomeSample(field: WorldField, x: number, z: number): BiomeSample {
  const h = field.heightAt(x, z);
  const n = field.detailNoise(x * 0.01, z * 0.01) * 0.08;
  return {
    height01: clamp(h / field.amplitude, 0, 1),
    slope: field.slopeAt(x, z),
    temperature: field.recipe.climate.temperature + n,
    moisture: field.recipe.climate.moisture + n,
    nearWater: field.waterDistance(x, z) < 25,
    nearSea: field.hasSea && h < field.seaLevelY + 2.5,
  };
}

export function biomeAt(field: WorldField, x: number, z: number): Biome {
  return classifyBiome(biomeSample(field, x, z));
}

export const BIOME_COLOR: Record<Biome, [number, number, number]> = {
  sand: [0.86, 0.79, 0.6],
  grass: [0.42, 0.6, 0.28],
  forest: [0.25, 0.45, 0.2],
  pine: [0.22, 0.36, 0.24],
  snow: [0.93, 0.95, 0.98],
  rock: [0.47, 0.45, 0.42],
  desert: [0.85, 0.6, 0.38],
  marsh: [0.36, 0.42, 0.26],
};

export type Rgb = readonly [number, number, number];

/** '#rrggbb' → linear-ish 0..1 components (the same space as BIOME_COLOR). */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const luma = ([r, g, b]: Rgb): number => 0.3 * r + 0.59 * g + 0.11 * b;

/**
 * A biome's ground colour, pulled toward the recipe's palette ground colour when it has one ("a red planet"). The tint
 * is scaled by the biome's own brightness, so snow stays lighter than forest and rock: the land still reads as varied.
 */
export function groundColor(biome: Biome, tint: Rgb | undefined): Rgb {
  const c = BIOME_COLOR[biome];
  if (!tint) return c;
  const k = clamp(luma(c) / 0.45, 0.55, 1.7);
  // A floor of 0.06 per channel: "pure black ground" still shows its slopes and biomes.
  return [0, 1, 2].map((i) => c[i] + (Math.min(1, Math.max(tint[i], 0.06) * k) - c[i]) * 0.85) as unknown as Rgb;
}

const mix = (a: Rgb, b: Rgb, k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/**
 * The ground colour for a sample, blended across the rock and snow edges instead of switching at a threshold: slope
 * changes a lot from one 2 m vertex to the next, so a hard switch drew jagged, saw-toothed rock and snow patches.
 * (What grows where still uses the discrete classifyBiome.)
 */
export function blendedGroundColor(s: BiomeSample, tint: Rgb | undefined): Rgb {
  const flat = { ...s, slope: 0 };
  const t = s.temperature - s.height01 * 0.55;
  // Just below the snow line, the colour of the land as if it were a little warmer; snow fades in over the band.
  const snowK = 1 - smoothstep(0.0, 0.1, t);
  const warm = groundColor(classifyBiome(t < 0.05 ? { ...flat, temperature: s.temperature + (0.06 - t) } : flat), tint);
  const ground = snowK > 0 ? mix(warm, groundColor('snow', tint), snowK) : warm;
  const rockK = smoothstep(0.55, 0.95, s.slope);
  return rockK > 0 ? mix(ground, groundColor('rock', tint), rockK) : ground;
}
