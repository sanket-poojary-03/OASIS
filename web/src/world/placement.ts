import { CORE_HALF, type Place, type PlaceKind, type PlaceSize, type Recipe, type Relation } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Pad, WorldField } from './field';
import { groupRadius, MAX_GROUP_RADIUS } from './layouts';
import { clamp } from './noise';

export interface Placement {
  id: string;
  kind: PlaceKind;
  x: number;
  z: number;
  y: number;
  rotation: number;
  radius: number;
  reasons: string[];
  warnings: string[];
  /** The solver flattened a pad here (padAllowed passed). Kept placements re-pad only when this is true. */
  padded: boolean;
}

const RADIUS: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 40, medium: 65, large: 95 },
  landmark: { small: 8, medium: 12, large: 18 },
  structure: { small: 6, medium: 9, large: 13 },
  prop: { small: 1.5, medium: 2.5, large: 4 },
};
const MAX_SLOPE: Record<PlaceKind, number> = { settlement: 0.22, landmark: 0.5, structure: 0.32, prop: 0.6 };
const GAP = 4;
const CANDIDATES = 1500;
const DIR: Record<'north' | 'south' | 'east' | 'west', { x: number; z: number }> = {
  north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 },
};

type Rel<K extends Relation['rel']> = Extract<Relation, { rel: K }>;
interface Candidate { x: number; z: number; h: number; slope: number }

export function placeRadius(place: Place): number {
  const base = RADIUS[place.kind][place.size];
  return place.kind === 'settlement' && place.layout ? Math.min(MAX_GROUP_RADIUS, Math.max(base, groupRadius(place.layout, place.size))) : base;
}

function targetsOf(place: Place): string[] {
  return place.where.flatMap((r) => ('target' in r ? [r.target] : r.rel === 'direction' && r.of ? [r.of] : []));
}

export function orderPlaces(places: Place[]): Place[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const done = new Set<string>(), visiting = new Set<string>();
  const out: Place[] = [];
  const visit = (p: Place) => {
    if (done.has(p.id) || visiting.has(p.id)) return;
    visiting.add(p.id);
    for (const t of targetsOf(p)) { const q = byId.get(t); if (q) visit(q); }
    visiting.delete(p.id);
    done.add(p.id);
    out.push(p);
  };
  places.forEach(visit);
  return out;
}

function padFor(p: Placement): Pad {
  return { x: p.x, z: p.z, radius: p.kind === 'settlement' ? p.radius * 0.85 : p.radius, y: p.y };
}

function siteProblem(field: WorldField, x: number, z: number, r: number, maxSlope: number, placed: Map<string, Placement>, relax: boolean): string | null {
  if (Math.abs(x) > CORE_HALF - r || Math.abs(z) > CORE_HALF - r) return 'outside the world core';
  let slope = 0;
  for (const [dx, dz] of [[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]]) {
    if (field.isWater(x + dx, z + dz)) return 'in water';
    slope = Math.max(slope, field.slopeAt(x + dx, z + dz));
  }
  if (slope > maxSlope * (relax ? 2 : 1)) return 'too steep';
  for (const p of placed.values()) if (Math.hypot(p.x - x, p.z - z) < p.radius + r + (relax ? 0 : GAP)) return `overlapping ${p.id}`;
  return null;
}

function lineOfSight(field: WorldField, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    if (field.heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > a.y + (b.y - a.y) * t) return false;
  }
  return true;
}

interface ScoreCtx { field: WorldField; placed: Map<string, Placement>; minH: number; maxH: number; radius: number }

function scoreRelation(rel: Relation, c: Candidate, ctx: ScoreCtx): { score: number; reason: string } {
  switch (rel.rel) {
    case 'highest': return { score: (c.h - ctx.minH) / Math.max(1e-6, ctx.maxH - ctx.minH), reason: `high ground (${c.h.toFixed(0)} m)` };
    case 'lowest': return { score: 1 - (c.h - ctx.minH) / Math.max(1e-6, ctx.maxH - ctx.minH), reason: `low ground (${c.h.toFixed(0)} m)` };
    case 'flat': return { score: 1 - clamp(c.slope / 0.35, 0, 1), reason: `gentle slope (${Math.round((Math.atan(c.slope) * 180) / Math.PI)}°)` };
    case 'by_water': {
      const d = Math.max(0, ctx.field.waterDistance(c.x, c.z) - ctx.radius);
      return { score: 1 - clamp(d / 80, 0, 1), reason: `${d.toFixed(0)} m from water` };
    }
    case 'near': {
      const t = ctx.placed.get(rel.target);
      if (!t) return { score: 0.5, reason: `${rel.target} not placed yet` };
      const d = Math.max(0, Math.hypot(t.x - c.x, t.z - c.z) - t.radius - ctx.radius);
      return { score: 1 - clamp(d / rel.maxDist, 0, 1), reason: `${d.toFixed(0)} m from ${t.id}` };
    }
    case 'far_from': {
      const t = ctx.placed.get(rel.target);
      if (!t) return { score: 0.5, reason: `${rel.target} not placed yet` };
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      return { score: clamp(d / rel.minDist, 0, 1), reason: `${d.toFixed(0)} m from ${t.id}` };
    }
    case 'direction': {
      const o = rel.of ? ctx.placed.get(rel.of) : undefined;
      const dx = c.x - (o?.x ?? 0), dz = c.z - (o?.z ?? 0);
      const len = Math.hypot(dx, dz) || 1;
      const v = DIR[rel.dir];
      const dot = (dx * v.x + dz * v.z) / len;
      return { score: dot > 0.3 ? (dot + 1) / 2 : ((dot + 1) / 2) * 0.3, reason: `${rel.dir} of ${o?.id ?? 'the centre'}` };
    }
    case 'visible_from': {
      const t = ctx.placed.get(rel.target);
      if (!t) return { score: 0.5, reason: `${rel.target} not placed yet` };
      const ok = lineOfSight(ctx.field, { x: t.x, y: t.y + 3, z: t.z }, { x: c.x, y: c.h + 8, z: c.z });
      return { score: ok ? 1 : 0, reason: ok ? `visible from ${t.id}` : `hidden from ${t.id}` };
    }
    case 'at': return { score: 1, reason: 'placed where you asked' };
  }
}

function sampleCandidates(place: Place, placed: Map<string, Placement>, rng: () => number): Array<{ x: number; z: number }> {
  const near = place.where.find((r): r is Rel<'near'> => r.rel === 'near' && placed.has(r.target));
  const out: Array<{ x: number; z: number }> = [];
  const r = placeRadius(place);
  for (let i = 0; i < CANDIDATES; i++) {
    if (near) {
      const t = placed.get(near.target)!;
      const a = rng() * Math.PI * 2;
      const d = t.radius + r + GAP + Math.sqrt(rng()) * near.maxDist;
      out.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d });
    } else {
      const lim = CORE_HALF * 0.9;
      out.push({ x: (rng() * 2 - 1) * lim, z: (rng() * 2 - 1) * lim });
    }
  }
  return out;
}

function finish(place: Place, field: WorldField, x: number, z: number, radius: number, reasons: string[], warnings: string[], placed: Map<string, Placement>, yOverride?: number): Placement {
  const pts = [[0, 0], [radius * 0.5, 0], [-radius * 0.5, 0], [0, radius * 0.5], [0, -radius * 0.5]];
  const avg = pts.reduce((s, [dx, dz]) => s + field.heightAt(x + dx, z + dz), 0) / pts.length;
  const targetId = targetsOf(place).find((id) => placed.has(id));
  const face = targetId ? placed.get(targetId)! : { x: 0, z: 0 };
  const rotation = Math.atan2(face.x - x, face.z - z);
  return { id: place.id, kind: place.kind, x, z, y: yOverride ?? (place.kind === 'prop' ? field.heightAt(x, z) : avg), rotation, radius, reasons, warnings, padded: false };
}

function placeOne(place: Place, field: WorldField, placed: Map<string, Placement>, seed: number): Placement {
  const radius = placeRadius(place);
  const warnings: string[] = [];
  for (const id of targetsOf(place)) if (!placed.has(id)) warnings.push(`${id} was not placed before ${place.id}`);
  const at = place.where.find((r): r is Rel<'at'> => r.rel === 'at');
  if (at) {
    const problem = siteProblem(field, at.x, at.z, radius, MAX_SLOPE[place.kind], placed, false);
    if (problem) warnings.push(`requested spot is ${problem}`);
    return finish(place, field, at.x, at.z, radius, ['placed where you asked'], warnings, placed, place.kind === 'prop' ? at.y : undefined);
  }
  const rng = mulberry32(seed ^ hashString(place.id));
  for (const relax of [false, true]) {
    const cands: Candidate[] = [];
    for (const p of sampleCandidates(place, placed, rng)) {
      if (siteProblem(field, p.x, p.z, radius, MAX_SLOPE[place.kind], placed, relax) === null) {
        cands.push({ ...p, h: field.heightAt(p.x, p.z), slope: field.slopeAt(p.x, p.z) });
      }
    }
    if (cands.length === 0) continue;
    if (relax) warnings.push('no ideal spot; relaxed slope and spacing limits');
    let minH = Infinity, maxH = -Infinity;
    for (const c of cands) { minH = Math.min(minH, c.h); maxH = Math.max(maxH, c.h); }
    const ctx: ScoreCtx = { field, placed, minH, maxH, radius };
    let best = cands[0], bestScore = -Infinity, bestScored: Array<{ score: number; reason: string }> = [];
    for (const c of cands) {
      const scored = place.where.map((r) => scoreRelation(r, c, ctx));
      const mean = scored.length ? scored.reduce((s, x) => s + x.score, 0) / scored.length : 0.5;
      const total = mean + 0.05 * (1 - clamp(c.slope / 0.5, 0, 1));
      if (total > bestScore) { bestScore = total; best = c; bestScored = scored; }
    }
    const reasons = bestScored.map((s) => s.reason);
    place.where.forEach((r, i) => { if (bestScored[i] && bestScored[i].score < 0.3) warnings.push(`could not fully satisfy "${r.rel}"`); });
    if (reasons.length === 0) reasons.push('open, gentle ground');
    return finish(place, field, best.x, best.z, radius, reasons, warnings, placed);
  }
  // Last resort: the least-bad candidate (never wet if any dry one exists), centre as a final tiebreak.
  let best = { x: 0, z: 0 }, bestCost = Infinity;
  for (const c of [{ x: 0, z: 0 }, ...sampleCandidates(place, placed, rng)]) {
    const cost = fallbackCost(field, c.x, c.z, radius, MAX_SLOPE[place.kind], placed);
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  warnings.push('no valid spot found; placed at the least-bad spot');
  return finish(place, field, best.x, best.z, radius, [], warnings, placed);
}

function fallbackCost(field: WorldField, x: number, z: number, r: number, maxSlope: number, placed: Map<string, Placement>): number {
  let cost = 0;
  if (Math.abs(x) > CORE_HALF - r || Math.abs(z) > CORE_HALF - r) cost += 1000;
  let slope = 0;
  for (const [dx, dz] of [[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]]) {
    if (field.isWater(x + dx, z + dz)) cost += dx === 0 && dz === 0 ? 10000 : 2000;
    slope = Math.max(slope, field.slopeAt(x + dx, z + dz));
  }
  cost += Math.max(0, slope - maxSlope) * 100;
  for (const p of placed.values()) cost += Math.max(0, p.radius + r - Math.hypot(p.x - x, p.z - z)) * 5;
  return cost;
}

/** A pad may only be added where it will not flatten water or another place. */
function padAllowed(field: WorldField, p: Placement, placed: Map<string, Placement>): boolean {
  return siteProblem(field, p.x, p.z, p.radius, Infinity, placed, true) === null;
}

export function solvePlacements(recipe: Recipe, field: WorldField, fixed: Placement[] = []): Placement[] {
  const placed = new Map<string, Placement>();
  const kept = new Map(fixed.map((p) => [p.id, p]));
  for (const p of fixed) placed.set(p.id, p); // every kept place counts for spacing and relations from the start
  // Pads go down in solve order, kept or new, and only where the solver padded: pads blend in sequence, so a rebuild
  // that keeps every placement (undo, a later edit) lays the same pads in the same order and reproduces the terrain.
  for (const place of orderPlaces(recipe.places)) {
    const k = kept.get(place.id);
    if (k) { if (k.padded) field.addPad(padFor(k)); continue; }
    const pl = placeOne(place, field, placed, recipe.seed);
    pl.padded = place.kind !== 'prop' && padAllowed(field, pl, placed);
    if (pl.padded) field.addPad(padFor(pl));
    placed.set(pl.id, pl);
  }
  return recipe.places.map((p) => placed.get(p.id)!).filter(Boolean);
}

export function findSpawn(field: WorldField, placements: Placement[]): { x: number; y: number; z: number } {
  const s = placements.find((p) => p.kind === 'settlement');
  // Spec 8.6: beside the first settlement, otherwise near the centre (searched outward from 0,0).
  const cx = s?.x ?? 0, cz = s?.z ?? 0, r = s ? s.radius + 6 : 0;
  const ok = (x: number, z: number) => Math.abs(x) < CORE_HALF && Math.abs(z) < CORE_HALF && !field.isWater(x, z) && field.slopeAt(x, z) < 0.5;
  for (let i = 0; i < 96; i++) {
    const a = i * 0.7, d = r + i * 2;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (ok(x, z)) return { x, y: field.heightAt(x, z) + 1.2, z };
  }
  if (s) { // settlement ring was all wet/steep: fall back to dry ground outward from the centre
    for (let i = 0; i < 400; i++) {
      const a = i * 0.7, d = i * 2;
      if (d > CORE_HALF) break;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (ok(x, z)) return { x, y: field.heightAt(x, z) + 1.2, z };
    }
  }
  return { x: 0, y: field.heightAt(0, 0) + 2, z: 0 };
}
