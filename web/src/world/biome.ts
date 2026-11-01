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
