import { CORE_HALF } from '../core/recipe';
import type { WorldField } from './field';
import type { Placement } from './placement';

export interface Check { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }

const CELL = 8;

/** Cells reachable on foot (swimming allowed) from the spawn: slope < 0.9 between cells. */
function reachable(field: WorldField, spawn: { x: number; z: number }): { ok: (x: number, z: number, r: number) => boolean } {
  const n = Math.floor((CORE_HALF * 2) / CELL) + 1;
  const toIdx = (x: number, z: number) => {
    const c = Math.round((x + CORE_HALF) / CELL), r = Math.round((z + CORE_HALF) / CELL);
    return c < 0 || r < 0 || c >= n || r >= n ? -1 : r * n + c;
  };
  const walk = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    walk[r * n + c] = field.slopeAt(c * CELL - CORE_HALF, r * CELL - CORE_HALF) < 0.9 ? 1 : 0;
  }
  const seen = new Uint8Array(n * n);
  const start = toIdx(spawn.x, spawn.z);
  const queue: number[] = start >= 0 ? [start] : [];
  if (start >= 0) seen[start] = 1;
  while (queue.length) {
    const cur = queue.pop()!;
    const c = cur % n, r = Math.floor(cur / n);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= n || nr >= n) continue;
      const nb = nr * n + nc;
      if (!seen[nb] && walk[nb]) { seen[nb] = 1; queue.push(nb); }
    }
  }
  return {
    ok: (x, z, radius) => {
      for (let dz = -radius - CELL; dz <= radius + CELL; dz += CELL) for (let dx = -radius - CELL; dx <= radius + CELL; dx += CELL) {
        const i = toIdx(x + dx, z + dz);
        if (i >= 0 && seen[i]) return true;
      }
      return false;
    },
  };
}

export function runChecks(field: WorldField, placements: Placement[], spawn: { x: number; z: number }): Check[] {
  const checks: Check[] = [];
  const reach = reachable(field, spawn);
  for (const p of placements) {
    const wet = field.isWater(p.x, p.z);
    checks.push({
      id: `${p.id}-site`,
      label: `${p.id}: solid ground`,
      status: wet ? 'fail' : p.warnings.length ? 'warn' : 'pass',
      detail: wet ? 'centre is in water' : p.warnings.length ? p.warnings.join('; ') : p.reasons.join(', '),
    });
    const ok = reach.ok(p.x, p.z, p.radius);
    checks.push({
      id: `${p.id}-reach`,
      label: `${p.id}: reachable on foot`,
      status: ok ? 'pass' : 'warn',
      detail: ok ? 'a walkable route exists from the start point' : 'cliffs cut it off from the start point',
    });
  }
  return checks;
}
