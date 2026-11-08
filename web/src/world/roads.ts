import { CORE_HALF } from '../core/recipe';
import type { Road, WorldField } from './field';
import { MinHeap } from './minHeap';
import type { Vec2 } from './river';
import { isClearOfWater } from './waterDepth';

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
interface Samples { cell: number; pads: number; side: number; slope: Float32Array; height: Float32Array; floor: Float32Array; water: Uint8Array; done: Uint8Array }
const samplesOf = new WeakMap<WorldField, Samples>();

function samples(field: WorldField, cell: number): Samples {
  let s = samplesOf.get(field);
  // Roads never change the terrain; pads do, so a new pad (or another cell size) starts afresh.
  if (!s || s.cell !== cell || s.pads !== field.pads.length) {
    const side = Math.floor((CORE_HALF * 2) / cell) + 1;
    s = { cell, pads: field.pads.length, side, slope: new Float32Array(side * side), height: new Float32Array(side * side), floor: new Float32Array(side * side), water: new Uint8Array(side * side), done: new Uint8Array(side * side) };
    samplesOf.set(field, s);
  }
  return s;
}

/** Slope (rise over run, ~22 degrees) above which a road cell gets STEEP_COST extra per unit of slope. */
const STEEP = 0.4;
const STEEP_COST = 80;

/** Something a road should go around: a building or a named thing. A way through stays possible, at a high price. */
export interface RoadObstacle { x: number; z: number; r: number }
const AVOID_COST = 300;

/** A metre over water costs this much more than a metre on land, so a road crosses square on, and only if it must. */
const WATER_COST = 50;
/** And a metre along a shore this much: a road keeps back from the bank. */
const SHORE_COST = 6;
const ROAD_WIDTH = 4;
/** Clear ground a road wants past its edge. */
const ROAD_MARGIN = 0.5;
/** How far apart a laid road is tested against water. */
const CHECK_STEP = 2;

/** The longest run of bridge over water a road may have: a river or a strait, not open sea between islets. */
export const MAX_BRIDGE = 60;

/** Ground steeper than this (about 42 degrees) is a cliff. A road does not lie on it while there is any other way. */
export const CLIFF = 0.9;
/**
 * The steepest ground a road takes when cliffs leave it no other way. Measured: mountain worlds need up to 1.8 to reach
 * every place, while the walls of a canyon of the usual height run 2.4 to 4.5.
 */
export const WALL = 2;
/** How far a road may dip below both its ends on that steep ground. */
const MAX_PLUNGE = 25;
/** The longest span over a gap in the land: wide enough for a canyon, rim to rim. */
export const MAX_SPAN = 170;
/** A metre of high span costs this much more than a metre of level road, so a dip the road can simply follow stays a road. */
const SPAN_COST = 6;
/** A gap has to fall at least this far below the deck to be worth a span. */
const SPAN_MIN_DROP = 8;
/** The ground right ahead falls this far: a lip, the only place a span is looked for. */
const SPAN_LIP = 2;
/** Under the middle of a span the ground stays at least this far below the deck, its ends excepted. */
const SPAN_CLEAR = 1.5;
/** How far from each end the ground may still be close under the deck. */
const SPAN_END = 12;
/** The two ends of a span are about level: a bridge is not a ramp into a canyon. */
const SPAN_MAX_TILT = 0.08;
/** How far apart the ground under a planned span is measured. */
const SPAN_CHECK = 4;
const SPAN_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
/** Lattice cells this close to a road's end may be steep: a place can stand at the top of a slope. */
const END_CELLS = 2;

/** Metres of the longest unbroken run of bridge over water in `road`. A high span stands clear of the water under it. */
export function longestBridge(road: Road): number {
  let run = 0, best = 0;
  for (let i = 0; i < road.bridges.length; i++) {
    run = road.bridges[i] && !road.high?.[i] ? run + Math.hypot(road.points[i + 1].x - road.points[i].x, road.points[i + 1].z - road.points[i].z) : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Whether a straight deck from `a` to `b` stands over a real gap: the ground under it falls well below the line between
 * its ends, by walls no road could take, and touches it nowhere across the deck's whole width. Depth counts to the water,
 * not the bed under it: a river between low banks gets a bridge of its own width. No sea lies under it (islets stay apart).
 */
function spansGap(field: WorldField, a: Vec2, b: Vec2): boolean {
  const ya = field.heightAt(a.x, a.z), yb = field.heightAt(b.x, b.z);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (Math.abs(ya - yb) > len * SPAN_MAX_TILT) return false;
  const nx = (-(b.z - a.z) / len) * (ROAD_WIDTH / 2), nz = ((b.x - a.x) / len) * (ROAD_WIDTH / 2);
  const n = Math.ceil(len / SPAN_CHECK);
  let drop = 0, sheer = false;
  for (let i = 1; i < n; i++) {
    const t = i / n, along = t * len;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, line = ya + (yb - ya) * t;
    const clear = along < SPAN_END || len - along < SPAN_END ? 0 : SPAN_CLEAR;
    for (const s of [0, -1, 1]) {
      const h = field.heightAt(x + nx * s, z + nz * s);
      if (h > line - clear || (field.hasSea && h < field.seaLevelY)) return false;
      if (s === 0) drop = Math.max(drop, line - Math.max(h, field.waterSurfaceAt(x, z) ?? -Infinity));
    }
  }
  if (drop < SPAN_MIN_DROP) return false;
  for (let i = 1; i < n && !sheer; i++) sheer = field.slopeAt(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n) > CLIFF;
  return sheer;
}

/** Whether a road drops well below both its ends: down into a gorge and out again, not up to where it is going. */
function plunges(field: WorldField, road: Road): boolean {
  const a = road.points[0], b = road.points[road.points.length - 1];
  const floor = Math.min(field.heightAt(a.x, a.z), field.heightAt(b.x, b.z)) - MAX_PLUNGE;
  return road.points.some((p) => field.heightAt(p.x, p.z) < floor);
}

/**
 * A road from `from` to `to` that never bridges more than MAX_BRIDGE: the cheapest path first; if it crosses open
 * water, the way round over dry land; if there is none (separate islets), no road, and the player swims or flies.
 * Cliffs stop it, and a high span takes it over a gap. Only where cliffs shut a place in does it take steeper ground
 * (a castle on a peak), and never to plunge into a gorge and climb out: there is no road there at all.
 */
export function findRoad(field: WorldField, from: Vec2, to: Vec2, avoid: RoadObstacle[] = []): Road | null {
  if (field.deckY !== null) return boardwalk(field, from, to);
  const road = findPath(field, from, to, 8, true, avoid);
  if (!road) {
    const steep = findPath(field, from, to, 8, true, avoid, WALL);
    return steep && longestBridge(steep) <= MAX_BRIDGE && !plunges(field, steep) ? steep : null;
  }
  if (longestBridge(road) <= MAX_BRIDGE) return road;
  const dry = findPath(field, from, to, 8, false, avoid);
  return dry && longestBridge(dry) <= MAX_BRIDGE ? dry : null;
}

/** In an ocean, decks are joined by straight boardwalks: a road that is a bridge wherever it is not on a deck. */
function boardwalk(field: WorldField, from: Vec2, to: Vec2): Road {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 8));
  const points = Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, z: from.z + ((to.z - from.z) * i) / steps }));
  const bridges = points.slice(1).map((p, i) => field.isWater((p.x + points[i].x) / 2, (p.z + points[i].z) / 2));
  return { points, width: 3, bridges };
}

/**
 * The search's lattice path as a road: its land smoothed, each crossing one straight span from bank to bank. Smoothing
 * a crossing with the rest drew it as a long slant across the water. `gaps`: the points of `raw` reached by a high span.
 */
function layOut(field: WorldField, raw: Vec2[], gaps: ReadonlySet<number>): Road {
  const margin = ROAD_WIDTH / 2 + ROAD_MARGIN;
  const onLand = (a: Vec2, b: Vec2): boolean => {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / CHECK_STEP));
    for (let i = 0; i <= n; i++) if (!isClearOfWater(field, a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, margin)) return false;
    return true;
  };
  const allOnLand = (run: Vec2[]) => run.every((p, i) => i === 0 || onLand(run[i - 1], p));
  /** The last clear point on the way from `a` to `b`: where a span from `a` really has to start. */
  const bankToward = (a: Vec2, b: Vec2): Vec2 => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let bank = a;
    for (let t = 1; t < len; t++) {
      const p = { x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len };
      if (!isClearOfWater(field, p.x, p.z, margin)) break;
      bank = p;
    }
    return bank;
  };
  const points: Vec2[] = [];
  const bridges: boolean[] = [];
  /** Which segments of `bridges` are high spans. */
  const highs = new Set<number>();
  const addLand = (run: Vec2[]): void => {
    const smooth = chaikin(run, 2);
    const line = allOnLand(smooth) ? smooth : run; // a smoothed bend can cut across a bay
    line.forEach((p, i) => {
      if (i === 0 && points.length > 0) return; // the end of the span before it
      if (points.length > 0) bridges.push(!onLand(points[points.length - 1], p));
      points.push(p);
    });
  };
  let land: Vec2[] = [raw[0]];
  let last = 0;
  for (let k = 1; k < raw.length; k++) {
    if (gaps.has(k)) {
      addLand(land);
      highs.add(bridges.length);
      points.push(raw[k]);
      bridges.push(true);
      land = [raw[k]];
      last = k;
      continue;
    }
    if (k < raw.length - 1 && !isClearOfWater(field, raw[k].x, raw[k].z, margin)) continue;
    if (k === last + 1 && onLand(raw[last], raw[k])) land.push(raw[k]);
    else {
      const near = bankToward(raw[last], raw[k]), far = bankToward(raw[k], raw[last]);
      addLand(near === raw[last] ? land : [...land, near]);
      points.push(far);
      bridges.push(true);
      land = far === raw[k] ? [far] : [far, raw[k]];
    }
    last = k;
  }
  addLand(land);
  // Spans over water that meet are one straight span: a bridge has no corners. High spans stay as the search checked them.
  const straight: Vec2[] = points.slice(0, 1), flags: boolean[] = [], high: boolean[] = [];
  bridges.forEach((b, i) => {
    if (b && flags[flags.length - 1] && !highs.has(i) && !high[high.length - 1]) straight[straight.length - 1] = points[i + 1];
    else { straight.push(points[i + 1]); flags.push(b); high.push(highs.has(i)); }
  });
  return { points: straight, width: ROAD_WIDTH, bridges: flags, ...(highs.size > 0 ? { high } : {}) };
}

/** `overWater`: false keeps the path on dry land (water cells cannot be entered). */
export function findPath(field: WorldField, from: Vec2, to: Vec2, cell = 8, overWater = true, avoid: RoadObstacle[] = [], cliff = CLIFF): Road | null {
  const pad = 160;
  const S = samples(field, cell);
  const snap = (v: number, up: boolean) => Math.max(0, Math.min(S.side - 1, (up ? Math.ceil : Math.floor)((v + CORE_HALF) / cell)));
  const c0 = snap(Math.min(from.x, to.x) - pad, false), c1 = snap(Math.max(from.x, to.x) + pad, true);
  const r0 = snap(Math.min(from.z, to.z) - pad, false), r1 = snap(Math.max(from.z, to.z) + pad, true);
  const minX = -CORE_HALF + c0 * cell, minZ = -CORE_HALF + r0 * cell;
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
  const n = cols * rows;
  const px = (c: number) => minX + c * cell, pz = (r: number) => minZ + r * cell;
  const slope = new Float32Array(n), height = new Float32Array(n), floor = new Float32Array(n), water = new Uint8Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, k = (r0 + r) * S.side + (c0 + c);
    if (!S.done[k]) {
      S.slope[k] = field.slopeAt(px(c), pz(r));
      S.height[k] = field.heightAt(px(c), pz(r));
      S.water[k] = field.isWater(px(c), pz(r)) ? 1 : 0;
      // How far down a gap goes: to its water, not the bed under it.
      S.floor[k] = S.water[k] ? Math.max(S.height[k], field.waterSurfaceAt(px(c), pz(r)) ?? -Infinity) : S.height[k];
      S.done[k] = 1;
    }
    slope[i] = S.slope[k];
    height[i] = S.height[k];
    floor[i] = S.floor[k];
    water[i] = S.water[k];
  }
  const shore = new Uint8Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (water[r * cols + c]) continue;
    for (let dr = -1; dr <= 1 && !shore[r * cols + c]; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && water[nr * cols + nc]) { shore[r * cols + c] = 1; break; }
    }
  }
  const taken = new Uint8Array(n);
  for (const o of avoid) {
    const c1o = Math.min(cols - 1, Math.ceil((o.x + o.r - minX) / cell)), r1o = Math.min(rows - 1, Math.ceil((o.z + o.r - minZ) / cell));
    for (let r = Math.max(0, Math.floor((o.z - o.r - minZ) / cell)); r <= r1o; r++) for (let c = Math.max(0, Math.floor((o.x - o.r - minX) / cell)); c <= c1o; c++) {
      if (Math.hypot(px(c) - o.x, pz(r) - o.z) < o.r) taken[r * cols + c] = 1;
    }
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
  const sc = start % cols, sr = Math.floor(start / cols);
  const nearEnd = (c: number, r: number) => Math.max(Math.abs(c - gc), Math.abs(r - gr)) <= END_CELLS || Math.max(Math.abs(c - sc), Math.abs(r - sr)) <= END_CELLS;
  const margin = ROAD_WIDTH / 2 + ROAD_MARGIN;
  /** A level spot where a span can stand. */
  const level = (i: number) => !water[i] && slope[i] < STEEP;
  /** And clear of the water: the dearer test, left until a span is otherwise sound. */
  const clearOfWater = (i: number) => isClearOfWater(field, px(i % cols), pz(Math.floor(i / cols)), margin);
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
      if ((slope[nb] > cliff || Math.abs(height[nb] - height[cur]) / step > cliff) && !nearEnd(nc, nr)) continue; // a cliff: no road goes up or down one
      // Steep ground costs far more past STEEP: a car cannot climb ~38 degrees, so roads take the longer, gentler way.
      const wet = water[nb] ? (overWater ? WATER_COST : Infinity) : shore[nb] ? SHORE_COST : 0;
      const cost = g[cur] + step * (1 + wet + 12 * slope[nb] + STEEP_COST * Math.max(0, slope[nb] - STEEP)) + (taken[nb] ? AVOID_COST : 0);
      if (cost < g[nb]) { g[nb] = cost; came[nb] = cur; heap.push(cost + h(nb), nb); }
    }
    // From a lip, the first level spot past the gap in each direction: the search weighs a span against any way round.
    if (!level(cur)) continue;
    for (const [dc, dr] of SPAN_DIRS) {
      const dist = Math.hypot(dc, dr) * cell;
      const lipC = cc + dc, lipR = cr + dr;
      if (lipC < 0 || lipR < 0 || lipC >= cols || lipR >= rows || height[lipR * cols + lipC] > height[cur] - SPAN_LIP) continue;
      let lowest = floor[lipR * cols + lipC];
      for (let k = 2; k * dist <= MAX_SPAN; k++) {
        const nc = cc + dc * k, nr = cr + dr * k;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) break;
        const nb = nr * cols + nc;
        const landing = height[nb], reach = k * dist * SPAN_MAX_TILT;
        // Cells passed so far on this line: a gap deep enough under the deck, level ends. All from what is already sampled.
        const worth = Math.min(height[cur], landing) - lowest >= SPAN_MIN_DROP && Math.abs(height[cur] - landing) <= reach;
        lowest = Math.min(lowest, floor[nb]);
        if (worth && !closed[nb] && level(nb) && spansGap(field, { x: px(cc), z: pz(cr) }, { x: px(nc), z: pz(nr) }) && clearOfWater(cur) && clearOfWater(nb)) {
          const cost = g[cur] + k * dist * (1 + SPAN_COST) + (taken[nb] ? AVOID_COST : 0);
          if (cost < g[nb]) { g[nb] = cost; came[nb] = cur; heap.push(cost + h(nb), nb); }
          break;
        }
        if (landing > height[cur] + reach) break; // ground above any deck from here: no landing past it could clear it
      }
    }
  }
  if (start !== goal && came[goal] === -1) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) { cells.push(i); if (i === start) break; }
  cells.reverse();
  // Neighbours on the lattice are one step apart; anything further is a high span. (+1: `from` comes first in the raw path.)
  const gaps = new Set<number>();
  for (let i = 1; i < cells.length; i++) {
    if (Math.abs(cells[i] % cols - cells[i - 1] % cols) > 1 || Math.abs(Math.floor(cells[i] / cols) - Math.floor(cells[i - 1] / cols)) > 1) gaps.add(i + 1);
  }
  // The search walks a lattice: from its first and last cells on to the real ends, or a road stops short of what it joins.
  return layOut(field, [from, ...cells.map((i) => ({ x: px(i % cols), z: pz(Math.floor(i / cols)) })), to], gaps);
}

export interface RoadNode { id: string; x: number; z: number }

/**
 * Which places get a road between them: a minimum spanning tree over every node (so all of them are connected by the
 * shortest total length of road), then the extra pairs the AI asked for that the tree does not already have. Pairs are
 * returned in a stable order (tree edges by price, then extras), so the same world always gets the same roads.
 * `price`: what joining two places costs; by default how far apart they are.
 */
export function roadNetwork(nodes: RoadNode[], extra: Array<[string, string]> = [], price: (a: RoadNode, b: RoadNode) => number = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const have = new Set<string>();
  if (nodes.length > 1) {
    const inTree = new Set([0]);
    const best = nodes.map((n) => price(n, nodes[0]));
    const from = nodes.map(() => 0);
    while (inTree.size < nodes.length) {
      let pick = -1;
      for (let i = 0; i < nodes.length; i++) if (!inTree.has(i) && (pick < 0 || best[i] < best[pick])) pick = i;
      inTree.add(pick);
      out.push([nodes[from[pick]].id, nodes[pick].id]);
      have.add(key(nodes[from[pick]].id, nodes[pick].id));
      for (let i = 0; i < nodes.length; i++) {
        if (inTree.has(i)) continue;
        const d = price(nodes[i], nodes[pick]);
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
