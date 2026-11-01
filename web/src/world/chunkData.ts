import { BIOME_COLOR, biomeAt } from './biome';
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
}

export function computeChunk(field: WorldField, cx: number, cz: number): ChunkData {
  const n = CHUNK_RES + 1;
  const step = CHUNK_SIZE / CHUNK_RES;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx * CHUNK_SIZE + i * step, z = cz * CHUNK_SIZE + j * step;
    const k = (j * n + i) * 3;
    const h = field.heightAt(x, z);
    positions[k] = x; positions[k + 1] = h; positions[k + 2] = z;
    const dx = (field.heightAt(x + 1, z) - field.heightAt(x - 1, z)) / 2;
    const dz = (field.heightAt(x, z + 1) - field.heightAt(x, z - 1)) / 2;
    const len = Math.hypot(dx, 1, dz);
    normals[k] = -dx / len; normals[k + 1] = 1 / len; normals[k + 2] = -dz / len;
    const [r, g, b] = BIOME_COLOR[biomeAt(field, x, z)];
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
  return { cx, cz, positions, normals, colors, indices, scatter: scatterChunk(field, cx, cz, CHUNK_SIZE) };
}
