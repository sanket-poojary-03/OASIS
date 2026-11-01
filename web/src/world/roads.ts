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

export function findPath(field: WorldField, from: Vec2, to: Vec2, cell = 8): Road | null {
  const pad = 160;
  const minX = Math.max(-CORE_HALF, Math.min(from.x, to.x) - pad), maxX = Math.min(CORE_HALF, Math.max(from.x, to.x) + pad);
  const minZ = Math.max(-CORE_HALF, Math.min(from.z, to.z) - pad), maxZ = Math.min(CORE_HALF, Math.max(from.z, to.z) + pad);
  const cols = Math.ceil((maxX - minX) / cell) + 1, rows = Math.ceil((maxZ - minZ) / cell) + 1;
  const n = cols * rows;
  const px = (c: number) => minX + c * cell, pz = (r: number) => minZ + r * cell;
  const slope = new Float32Array(n), water = new Uint8Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    slope[i] = field.slopeAt(px(c), pz(r));
    water[i] = field.isWater(px(c), pz(r)) ? 1 : 0;
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
      const cost = g[cur] + step * (1 + 12 * slope[nb]) + (water[nb] ? 60 : 0);
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
