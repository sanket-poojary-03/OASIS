export type Vec2 = { x: number; z: number };
export interface Lake { x: number; z: number; radius: number; levelY: number }
export interface RiverResult { path: Vec2[]; lake: Lake | null }

const DIRS: Vec2[] = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 8), z: Math.sin((i * Math.PI) / 8) }));

/**
 * Steepest-descent river. The bed may climb small bumps (it is carved later);
 * once the total climb exceeds maxClimb the river pools into a lake at the
 * lowest point it reached, and the path is cut there.
 */
export function traceRiver(
  height: (x: number, z: number) => number,
  start: Vec2,
  opts: { seaLevelY: number; bound: number; step?: number; maxSteps?: number; maxClimb?: number; lakeRadius?: number },
): RiverResult {
  const step = opts.step ?? 8;
  const maxSteps = opts.maxSteps ?? 600;
  const maxClimb = opts.maxClimb ?? 15;
  const path: Vec2[] = [{ ...start }];
  let p = { ...start };
  let prev: Vec2 | null = null;
  let h = height(p.x, p.z);
  let climb = 0;
  let lowest = { h, index: 0 };
  for (let i = 0; i < maxSteps; i++) {
    if (h <= opts.seaLevelY) return { path, lake: null };
    if (Math.abs(p.x) > opts.bound || Math.abs(p.z) > opts.bound) return { path, lake: null };
    let best: Vec2 | null = null, bestScore = Infinity, bestH = Infinity;
    for (const d of DIRS) {
      const dot = prev ? d.x * prev.x + d.z * prev.z : 1;
      if (dot < -0.2) continue;
      const nh = height(p.x + d.x * step, p.z + d.z * step);
      const score = nh + (1 - dot) * 0.6;
      if (score < bestScore) { bestScore = score; best = d; bestH = nh; }
    }
    if (!best) break;
    if (bestH > h) climb += bestH - h;
    if (climb > maxClimb) {
      const at = path[lowest.index];
      return { path: path.slice(0, lowest.index + 1), lake: { x: at.x, z: at.z, radius: opts.lakeRadius ?? 36, levelY: lowest.h + 0.5 } };
    }
    p = { x: p.x + best.x * step, z: p.z + best.z * step };
    prev = best;
    h = bestH;
    path.push({ ...p });
    if (h < lowest.h) lowest = { h, index: path.length - 1 };
  }
  return { path, lake: null };
}

export function segmentDistance(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/** Spatial hash of polyline segments for fast "distance to river/road" queries. */
export class SegmentIndex {
  private cells = new Map<string, Array<[Vec2, Vec2]>>();
  constructor(private readonly cell = 32) {}

  addPolyline(points: Vec2[]): void {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / this.cell), x1 = Math.floor(Math.max(a.x, b.x) / this.cell);
      const z0 = Math.floor(Math.min(a.z, b.z) / this.cell), z1 = Math.floor(Math.max(a.z, b.z) / this.cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = `${cx},${cz}`;
        const list = this.cells.get(key) ?? [];
        list.push([a, b]);
        this.cells.set(key, list);
      }
    }
  }

  distance(x: number, z: number, maxRange = 96): number {
    return this.nearest(x, z, maxRange)?.distance ?? Infinity;
  }

  /** The closest segment within range: its end points, and how far along it the closest point lies (0..1). */
  nearest(x: number, z: number, maxRange = 96): { distance: number; a: Vec2; b: Vec2; t: number } | null {
    const r = Math.ceil(maxRange / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = Infinity, seg: [Vec2, Vec2] | null = null;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const list = this.cells.get(`${cx + dx},${cz + dz}`);
      if (!list) continue;
      for (const s of list) {
        const d = segmentDistance(x, z, s[0], s[1]);
        if (d < best) { best = d; seg = s; }
      }
    }
    if (!seg || best > maxRange) return null;
    const [a, b] = seg;
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    return { distance: best, a, b, t: len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) };
  }
}
