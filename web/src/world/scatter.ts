import { hashString, mulberry32 } from '../core/rng';
import { biomeAt, type Biome } from './biome';
import type { WorldField } from './field';

export type ScatterKind = 'tree' | 'pine' | 'dead_tree' | 'bush' | 'rock' | 'cactus' | 'reed' | 'grass';
export interface ScatterItem { kind: ScatterKind; x: number; y: number; z: number; rotation: number; scale: number }

export const SCATTER_CELL = 4;

/** Probability per 4 m cell; first match wins. */
export const SCATTER_RULES: Record<Biome, Array<[ScatterKind, number]>> = {
  sand: [['rock', 0.02], ['grass', 0.03]],
  grass: [['grass', 0.3], ['bush', 0.05], ['tree', 0.04], ['rock', 0.02]],
  forest: [['tree', 0.22], ['bush', 0.08], ['grass', 0.15], ['rock', 0.02]],
  pine: [['pine', 0.24], ['rock', 0.04], ['grass', 0.06]],
  snow: [['pine', 0.06], ['rock', 0.05]],
  rock: [['rock', 0.08]],
  desert: [['cactus', 0.03], ['rock', 0.04], ['dead_tree', 0.01]],
  marsh: [['reed', 0.3], ['dead_tree', 0.03], ['grass', 0.1]],
};

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
    for (const [k, p] of SCATTER_RULES[biomeAt(field, x, z)]) {
      acc += p;
      if (roll < acc) { kind = k; break; }
    }
    if (!kind) continue;
    if (field.isWater(x, z)) continue;
    if (kind !== 'rock' && field.slopeAt(x, z) > 0.6) continue;
    if (field.isReserved(x, z, 2)) continue;
    out.push({ kind, x, y: field.heightAt(x, z), z, rotation: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.6 });
  }
  return out;
}
