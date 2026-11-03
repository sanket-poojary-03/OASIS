import type { WorldField } from './field';
import { clamp } from './noise';

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

export function biomeAt(field: WorldField, x: number, z: number): Biome {
  const h = field.heightAt(x, z);
  const n = field.detailNoise(x * 0.01, z * 0.01) * 0.08;
  return classifyBiome({
    height01: clamp(h / field.amplitude, 0, 1),
    slope: field.slopeAt(x, z),
    temperature: field.recipe.climate.temperature + n,
    moisture: field.recipe.climate.moisture + n,
    nearWater: field.waterDistance(x, z) < 25,
    nearSea: field.hasSea && h < field.seaLevelY + 2.5,
  });
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
