import { hashString, mulberry32 } from '../core/rng';
import { biomeAt, type Biome } from './biome';
import type { WorldField } from './field';

/** Ground grass is not a scatter kind: it is the wind grass in ChunkData.grass (one grass, not cones plus blades). */
export const SCATTER_KINDS = [
  'tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'bush', 'rock', 'pebble', 'cactus', 'reed',
  'flowers', 'fern', 'mushroom', 'log', 'stump',
] as const;
export type ScatterKind = (typeof SCATTER_KINDS)[number];
/** `variant` picks one of the kind's models (0..7, modulo how many it has), so a forest is never one tree repeated. */
export interface ScatterItem { kind: ScatterKind; x: number; y: number; z: number; rotation: number; scale: number; variant: number }

export const SCATTER_CELL = 4;
export const VARIANTS = 8;
const REED_DEPTH = 2.5;

type Rule = [ScatterKind, number];

/**
 * Which broadleaf tree a grove grows: a slow noise splits forests into oak, birch and autumn groves (hundreds of
 * metres each), so walking on the scenery changes instead of repeating.
 */
export function groveTree(grove: number): ScatterKind {
  if (grove > 0.3) return 'birch';
  if (grove < -0.35) return 'autumn_tree';
  return 'tree';
}

/** Probability per 4 m cell; first match wins. Trees and shrubs plus ground cover (flowers, ferns, mushrooms, logs). */
export function scatterRules(biome: Biome, grove: number, temperature: number): Rule[] {
  const t = groveTree(grove);
  switch (biome) {
    case 'sand': return temperature > 0.6 ? [['palm', 0.025], ['rock', 0.015], ['pebble', 0.03]] : [['rock', 0.02], ['pebble', 0.03]];
    case 'grass': return [['bush', 0.04], [t, 0.035], ['flowers', 0.07], ['rock', 0.015], ['pebble', 0.015], ['stump', 0.004]];
    case 'forest': return [[t, 0.17], ['bush', 0.06], ['fern', 0.08], ['mushroom', 0.025], ['log', 0.012], ['stump', 0.01], ['rock', 0.015], ['flowers', 0.02]];
    case 'pine': return [['pine', 0.2], ['fern', 0.04], ['rock', 0.03], ['log', 0.01], ['stump', 0.008], ['mushroom', 0.01]];
    case 'snow': return [['snowy_pine', 0.07], ['rock', 0.05]];
    case 'rock': return [['rock', 0.07], ['pebble', 0.05]];
    case 'desert': return [['cactus', 0.03], ['rock', 0.035], ['dead_tree', 0.008], ['pebble', 0.03]];
    case 'marsh': return [['reed', 0.25], ['dead_tree', 0.025], ['fern', 0.03], ['mushroom', 0.02], ['log', 0.01]];
  }
}

const ON_SLOPES: ReadonlySet<ScatterKind> = new Set(['rock', 'pebble']);

/** What lies on a bed: stones anywhere, reeds only where they can reach the surface. */
export function bedRules(depth: number): Rule[] {
  return depth < REED_DEPTH ? [['reed', 0.14], ['rock', 0.025], ['pebble', 0.05]] : [['rock', 0.025], ['pebble', 0.05]];
}

export function scatterChunk(field: WorldField, cx: number, cz: number, size = 64): ScatterItem[] {
  const out: ScatterItem[] = [];
  const n = size / SCATTER_CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const rng = mulberry32(hashString(`${field.recipe.seed}:${gx}:${gz}`));
    const x = gx * SCATTER_CELL + rng() * SCATTER_CELL;
    const z = gz * SCATTER_CELL + rng() * SCATTER_CELL;
    const roll = rng();
    let acc = 0, kind: ScatterKind | null = null;
    const surface = field.isWater(x, z) ? field.waterSurfaceAt(x, z) : null;
    const grove = field.detailNoise(x * 0.004 + 31.7, z * 0.004 - 12.3);
    const rules = surface !== null ? bedRules(surface - field.heightAt(x, z)) : scatterRules(biomeAt(field, x, z), grove, field.recipe.climate.temperature);
    for (const [k, p] of rules) {
      acc += p;
      if (roll < acc) { kind = k; break; }
    }
    if (!kind) continue;
    if (!ON_SLOPES.has(kind) && field.slopeAt(x, z) > 0.6) continue;
    if (field.isReserved(x, z, 2) || field.pavedAt(x, z) > 0) continue;
    out.push({ kind, x, y: field.heightAt(x, z), z, rotation: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.6, variant: Math.floor(rng() * VARIANTS) });
  }
  return out;
}
