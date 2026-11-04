import { CORE_HALF } from '../core/recipe';
import type { Road, WorldField } from './field';
import type { Vec2 } from './river';

class MinHeap {
  private items: Array<[number, number]> = [];
  get size() { return this.items.length; }
  push(f: number, v: number) {
    const a = this.items;
    a.push([f, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0][1];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function chaikin(points: Vec2[], iterations = 2): Vec2[] {
  let out = points;
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) break;
    const next: Vec2[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** Terrain samples on one lattice over the core, shared by every road of a field (a big world builds dozens). */
interface Samples { cell: number; pads: number; side: number; slope: Float32Array; water: Uint8Array; done: Uint8Array }
const samplesOf = new WeakMap<WorldField, Samples>();

function samples(field: WorldField, cell: number): Samples {
  let s = samplesOf.get(field);
  // Roads never change the terrain; pads do, so a new pad (or another cell size) starts afresh.
  if (!s || s.cell !== cell || s.pads !== field.pads.length) {
    const side = Math.floor((CORE_HALF * 2) / cell) + 1;
    s = { cell, pads: field.pads.length, side, slope: new Float32Array(side * side), water: new Uint8Array(side * side), done: new Uint8Array(side * side) };
    samplesOf.set(field, s);
  }
  return s;
}

/** Slope (rise over run, ~22 degrees) above which a road cell gets STEEP_COST extra per unit of slope. */
const STEEP = 0.4;
const STEEP_COST = 80;

/** The longest run of bridge a road may have: a river or a strait, not open sea between islets. */
export const MAX_BRIDGE = 60;

/** Metres of the longest unbroken bridged run of `road`. */
export function longestBridge(road: Road): number {
  let run = 0, best = 0;
  for (let i = 0; i < road.bridges.length; i++) {
    run = road.bridges[i] ? run + Math.hypot(road.points[i + 1].x - road.points[i].x, road.points[i + 1].z - road.points[i].z) : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * A road from `from` to `to` that never bridges more than MAX_BRIDGE: the cheapest path first; if it crosses open
 * water, the way round over dry land; if there is none (separate islets), no road, and the player swims or flies.
 */
export function findRoad(field: WorldField, from: Vec2, to: Vec2): Road | null {
  if (field.deckY !== null) return boardwalk(field, from, to);
  const road = findPath(field, from, to);
  if (!road || longestBridge(road) <= MAX_BRIDGE) return road;
  const dry = findPath(field, from, to, 8, false);
  return dry && longestBridge(dry) <= MAX_BRIDGE ? dry : null;
}

/** In an ocean, decks are joined by straight boardwalks: a road that is a bridge wherever it is not on a deck. */
function boardwalk(field: WorldField, from: Vec2, to: Vec2): Road {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 8));
  const points = Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, z: from.z + ((to.z - from.z) * i) / steps }));
  const bridges = points.slice(1).map((p, i) => field.isWater((p.x + points[i].x) / 2, (p.z + points[i].z) / 2));
  return { points, width: 3, bridges };
}

/** `overWater`: false keeps the path on dry land (water cells cannot be entered). */
export function findPath(field: WorldField, from: Vec2, to: Vec2, cell = 8, overWater = true): Road | null {
  const pad = 160;
  const S = samples(field, cell);
  const snap = (v: number, up: boolean) => Math.max(0, Math.min(S.side - 1, (up ? Math.ceil : Math.floor)((v + CORE_HALF) / cell)));
  const c0 = snap(Math.min(from.x, to.x) - pad, false), c1 = snap(Math.max(from.x, to.x) + pad, true);
  const r0 = snap(Math.min(from.z, to.z) - pad, false), r1 = snap(Math.max(from.z, to.z) + pad, true);
  const minX = -CORE_HALF + c0 * cell, minZ = -CORE_HALF + r0 * cell;
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
  const n = cols * rows;
  const px = (c: number) => minX + c * cell, pz = (r: number) => minZ + r * cell;
  const slope = new Float32Array(n), water = new Uint8Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, k = (r0 + r) * S.side + (c0 + c);
    if (!S.done[k]) {
      S.slope[k] = field.slopeAt(px(c), pz(r));
      S.water[k] = field.isWater(px(c), pz(r)) ? 1 : 0;
      S.done[k] = 1;
    }
    slope[i] = S.slope[k];
    water[i] = S.water[k];
  }
  const cellOf = (p: Vec2) => {
    const c = Math.max(0, Math.min(cols - 1, Math.round((p.x - minX) / cell)));
    const r = Math.max(0, Math.min(rows - 1, Math.round((p.z - minZ) / cell)));
    return r * cols + c;
  };
  const start = cellOf(from), goal = cellOf(to);
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const gc = goal % cols, gr = Math.floor(goal / cols);
  const h = (i: number) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr) * cell;
  g[start] = 0;
  heap.push(h(start), start);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % cols, cr = Math.floor(cur / cols);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nb = nr * cols + nc;
      if (closed[nb]) continue;
      const step = (dr && dc ? Math.SQRT2 : 1) * cell;
      // Steep ground costs far more past STEEP: a car cannot climb ~38 degrees, so roads take the longer, gentler way.
      const cost = g[cur] + step * (1 + 12 * slope[nb] + STEEP_COST * Math.max(0, slope[nb] - STEEP)) + (water[nb] ? (overWater ? 60 : Infinity) : 0);
      if (cost < g[nb]) { g[nb] = cost; came[nb] = cur; heap.push(cost + h(nb), nb); }
    }
  }
  if (start !== goal && came[goal] === -1) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) { cells.push(i); if (i === start) break; }
  cells.reverse();
  const raw = cells.map((i) => ({ x: px(i % cols), z: pz(Math.floor(i / cols)) }));
  const points = chaikin(raw, 2);
  const bridges: boolean[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    bridges.push(field.isWater((points[i].x + points[i + 1].x) / 2, (points[i].z + points[i + 1].z) / 2));
  }
  return { points, width: 4, bridges };
}

export interface RoadNode { id: string; x: number; z: number }

/**
 * Which places get a road between them: a minimum spanning tree over every node (so all of them are connected by the
 * shortest total length of road), then the extra pairs the AI asked for that the tree does not already have. Pairs are
 * returned in a stable order (tree edges by length, then extras), so the same world always gets the same roads.
 */
export function roadNetwork(nodes: RoadNode[], extra: Array<[string, string]> = []): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const have = new Set<string>();
  if (nodes.length > 1) {
    const inTree = new Set([0]);
    const best = nodes.map((n) => Math.hypot(n.x - nodes[0].x, n.z - nodes[0].z));
    const from = nodes.map(() => 0);
    while (inTree.size < nodes.length) {
      let pick = -1;
      for (let i = 0; i < nodes.length; i++) if (!inTree.has(i) && (pick < 0 || best[i] < best[pick])) pick = i;
      inTree.add(pick);
      out.push([nodes[from[pick]].id, nodes[pick].id]);
      have.add(key(nodes[from[pick]].id, nodes[pick].id));
      for (let i = 0; i < nodes.length; i++) {
        if (inTree.has(i)) continue;
        const d = Math.hypot(nodes[i].x - nodes[pick].x, nodes[i].z - nodes[pick].z);
        if (d < best[i]) { best[i] = d; from[i] = pick; }
      }
    }
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const [a, b] of extra) {
    if (a === b || !ids.has(a) || !ids.has(b) || have.has(key(a, b))) continue;
    have.add(key(a, b));
    out.push([a, b]);
  }
  return out;
}
