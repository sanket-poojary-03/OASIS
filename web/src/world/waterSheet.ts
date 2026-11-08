import { CHUNK_RES, CHUNK_SIZE } from './chunkData';
import { RIVER_WET, type WorldField } from './field';
import type { Lake } from './river';

/** One chunk's stretch of water surface, so stretches past the loaded terrain can be hidden. */
export interface SheetPiece { positions: number[]; indices: number[] }

/** Where a sheet runs past its shore, it lies this far under the ground, so its edge always ends inside the bank. */
const TUCK = 0.3;
const AT_SEA = 0.001;
/** A lake's ground stands above its water by here (field.ts): past this its level has no say. */
const LAKE_SHORE_REACH = 1.4;

const CELL = CHUNK_SIZE / CHUNK_RES;

function chunksNearWater(field: WorldField): Array<{ cx: number; cz: number }> {
  const seen = new Map<string, { cx: number; cz: number }>();
  const around = (x: number, z: number, reach: number): void => {
    for (let cx = Math.floor((x - reach) / CHUNK_SIZE); cx <= Math.floor((x + reach) / CHUNK_SIZE); cx++) {
      for (let cz = Math.floor((z - reach) / CHUNK_SIZE); cz <= Math.floor((z + reach) / CHUNK_SIZE); cz++) seen.set(`${cx},${cz}`, { cx, cz });
    }
  };
  if (field.river.length > 1) for (const p of field.river) around(p.x, p.z, RIVER_WET + CELL * 2);
  for (const l of field.lakes) around(l.x, l.z, l.radius + CELL * 2);
  return [...seen.values()];
}

function chunkSheet(field: WorldField, cx: number, cz: number): SheetPiece | null {
  const n = CHUNK_RES + 1, x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const xOf = (k: number) => x0 + (k % n) * CELL, zOf = (k: number) => z0 + Math.floor(k / n) * CELL;
  const lakeAt = (x: number, z: number, reach: number): Lake | undefined => field.lakes.find((l) => Math.hypot(x - l.x, z - l.z) < l.radius * reach);
  const wet = new Array<boolean>(n * n);
  for (let k = 0; k < n * n; k++) wet[k] = lakeAt(xOf(k), zOf(k), 1) !== undefined || (field.river.length > 1 && field.riverDistance(xOf(k), zOf(k), RIVER_WET) < RIVER_WET);
  const ys = new Map<number, number>();
  const yOf = (k: number): number => {
    let y = ys.get(k);
    if (y === undefined) {
      const x = xOf(k), z = zOf(k), lake = lakeAt(x, z, 1);
      if (lake) y = lake.levelY;
      else if (wet[k]) y = field.riverLevelAt(x, z);
      else y = Math.min(lakeAt(x, z, LAKE_SHORE_REACH)?.levelY ?? field.riverLevelAt(x, z), field.meshHeightAt(x, z) - TUCK);
      ys.set(k, y);
    }
    return y;
  };
  const positions: number[] = [], indices: number[] = [];
  const vertex = new Map<number, number>();
  const at = (k: number): number => {
    let v = vertex.get(k);
    if (v === undefined) {
      v = positions.length / 3;
      positions.push(xOf(k), yOf(k), zOf(k));
      vertex.set(k, v);
    }
    return v;
  };
  // The sea draws itself: a second sheet at its height would flicker against it.
  const triangle = (a: number, b: number, c: number): void => {
    if (field.hasSea && yOf(a) <= field.seaLevelY + AT_SEA && yOf(b) <= field.seaLevelY + AT_SEA && yOf(c) <= field.seaLevelY + AT_SEA) return;
    indices.push(at(a), at(b), at(c));
  };
  for (let j = 0; j < CHUNK_RES; j++) for (let i = 0; i < CHUNK_RES; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (!wet[a] && !wet[b] && !wet[c] && !wet[d]) continue;
    triangle(a, c, b); // split as the terrain's cells are, so the shore is exactly where the two surfaces cross
    triangle(b, c, d);
  }
  return indices.length ? { positions, indices } : null;
}

/**
 * The surface of a world's rivers and lakes, as one sheet on the terrain's own grid, measured the way the ground's
 * channel is: by distance from the line. A ribbon offset from the line cannot match that. It stopped square across the
 * channel's round ends, folded over itself on bends and left a wedge of dry bed wherever two runs splayed apart, and a
 * lake's separate disc drew a dark arc where it overlapped its river.
 */
export function waterSheet(field: WorldField): SheetPiece[] {
  const out: SheetPiece[] = [];
  for (const { cx, cz } of chunksNearWater(field)) {
    const piece = chunkSheet(field, cx, cz);
    if (piece) out.push(piece);
  }
  return out;
}
