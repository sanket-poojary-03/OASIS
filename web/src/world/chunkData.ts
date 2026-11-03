import { hashString, mulberry32 } from '../core/rng';
import { biomeAt, groundColor, hexToRgb, type Biome } from './biome';
import type { WorldField } from './field';
import { scatterChunk, type ScatterItem } from './scatter';

export const CHUNK_SIZE = 64;
export const CHUNK_RES = 32;

export interface ChunkData {
  cx: number;
  cz: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  scatter: ScatterItem[];
  /** Wind-grass tufts packed as x, y, z, rotation, scale (see grassChunk). */
  grass: Float32Array;
}

const GRASS_BIOMES: ReadonlySet<Biome> = new Set(['grass', 'forest', 'marsh', 'pine']);
const GRASS_CELL = 2;
/** City paving: light concrete, a touch warm. */
export const PAVED_COLOUR: readonly [number, number, number] = [0.5, 0.49, 0.47];

/** Grass tufts every ~2 m on dry, gentle, grassy ground. Packed as x, y, z, rotation, scale. */
export function grassChunk(field: WorldField, cx: number, cz: number): Float32Array {
  const out: number[] = [];
  const n = CHUNK_SIZE / GRASS_CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const rng = mulberry32(hashString(`g:${field.recipe.seed}:${gx}:${gz}`));
    const x = gx * GRASS_CELL + rng() * GRASS_CELL, z = gz * GRASS_CELL + rng() * GRASS_CELL;
    if (rng() > 0.7) continue;
    if (field.isWater(x, z) || field.slopeAt(x, z) > 0.7 || field.isReserved(x, z, 0.5) || field.pavedAt(x, z) > 0.2) continue;
    if (!GRASS_BIOMES.has(biomeAt(field, x, z))) continue;
    out.push(x, field.heightAt(x, z), z, rng() * Math.PI * 2, 0.7 + rng() * 0.6);
  }
  return new Float32Array(out);
}

export function computeChunk(field: WorldField, cx: number, cz: number): ChunkData {
  const n = CHUNK_RES + 1;
  const step = CHUNK_SIZE / CHUNK_RES;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const ground = field.recipe.palette?.ground, tint = ground ? hexToRgb(ground) : undefined;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx * CHUNK_SIZE + i * step, z = cz * CHUNK_SIZE + j * step;
    const k = (j * n + i) * 3;
    const h = field.heightAt(x, z);
    positions[k] = x; positions[k + 1] = h; positions[k + 2] = z;
    const dx = (field.heightAt(x + 1, z) - field.heightAt(x - 1, z)) / 2;
    const dz = (field.heightAt(x, z + 1) - field.heightAt(x, z - 1)) / 2;
    const len = Math.hypot(dx, 1, dz);
    normals[k] = -dx / len; normals[k + 1] = 1 / len; normals[k + 2] = -dz / len;
    let [r, g, b] = groundColor(biomeAt(field, x, z), tint);
    const pave = field.pavedAt(x, z);
    if (pave > 0) { r += (PAVED_COLOUR[0] - r) * pave; g += (PAVED_COLOUR[1] - g) * pave; b += (PAVED_COLOUR[2] - b) * pave; }
    const shade = 1 + field.detailNoise(x * 0.05, z * 0.05) * 0.06;
    colors[k] = r * shade; colors[k + 1] = g * shade; colors[k + 2] = b * shade;
  }
  const indices = new Uint32Array(CHUNK_RES * CHUNK_RES * 6);
  let p = 0;
  for (let j = 0; j < CHUNK_RES; j++) for (let i = 0; i < CHUNK_RES; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    indices[p++] = a; indices[p++] = c; indices[p++] = b;
    indices[p++] = b; indices[p++] = c; indices[p++] = d;
  }
  return { cx, cz, positions, normals, colors, indices, scatter: scatterChunk(field, cx, cz, CHUNK_SIZE), grass: grassChunk(field, cx, cz) };
}
