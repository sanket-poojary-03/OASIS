import { createNoise2D } from 'simplex-noise';
import { CORE_HALF, type Recipe } from '../core/recipe';
import { mulberry32 } from '../core/rng';
import { clamp, fbm, lerp, ridged, smoothstep } from './noise';
import { SegmentIndex, traceRiver, type Lake, type Vec2 } from './river';

export interface Pad { x: number; z: number; radius: number; y: number }
/** `paved`: asphalt (city streets, and every road in a world with a city grid); otherwise a dirt road. */
export interface Road { points: Vec2[]; width: number; bridges: boolean[]; paved?: boolean }
/** A paved square (a city grid's blocks): centre, half side, and its turn (radians). */
export interface Paved { x: number; z: number; half: number; angle: number }
/** Paving fades out over this many metres past its edge. */
const PAVED_EDGE = 3;

export interface WorldField {
  readonly recipe: Recipe;
  readonly amplitude: number;
  readonly seaLevelY: number;
  readonly hasSea: boolean;
  readonly river: Vec2[];
  readonly lakes: Lake[];
  readonly pads: Pad[];
  readonly roads: Road[];
  readonly paved: Paved[];
  meander(z: number): number;
  baseHeight(x: number, z: number): number;
  heightAt(x: number, z: number): number;
  slopeAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  waterDistance(x: number, z: number): number;
  waterSurfaceAt(x: number, z: number): number | null;
  detailNoise(x: number, z: number): number;
  addPad(p: Pad): void;
  addRoad(r: Road): void;
  addPaved(p: Paved): void;
  /** 1 on paving (city ground: no grass, no trees, concrete colour), fading to 0 just past its edge. */
  pavedAt(x: number, z: number): number;
  isReserved(x: number, z: number, margin: number): boolean;
}

export type FieldSnapshot = { recipe: Recipe; pads: Pad[]; roads: Road[]; paved?: Paved[] };

const RIVER_WET = 16;
const RIVER_CARVE_WIDTH = 26;
const RIVER_DEPTH = 5;

export function createField(recipe: Recipe): WorldField {
  const { terrain, seed } = recipe;
  const nA = createNoise2D(mulberry32(seed));
  const nB = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
  const nD = createNoise2D(mulberry32(seed ^ 0x85ebca6b));
  const amplitude = 20 + terrain.height * 140;
  const seaLevelY = terrain.seaLevel * amplitude;
  const hasSea = terrain.seaLevel > 0;
  const freq = 1 / (420 - terrain.roughness * 260);
  const gain = 0.42 + terrain.roughness * 0.18;

  const meander = (z: number) => 140 * nB(z * 0.0015, 11.7);

  // A sea on a world that is not an island needs a coast: the land falls below sea level toward one side (from the
  // seed), wavy, so "a city by the sea" really has a waterfront. Before this, plains (never below 0.3) had no sea at all.
  const coastAngle = mulberry32(seed ^ 0x27d4eb2f)() * Math.PI * 2;
  const coastX = Math.cos(coastAngle), coastZ = Math.sin(coastAngle);
  const coast = (x: number, z: number, h: number): number => {
    if (!hasSea || terrain.shape === 'island') return h;
    const along = (x * coastX + z * coastZ) / CORE_HALF + 0.12 * nB(x * 0.003 + 5.1, z * 0.003 - 7.3);
    const k = smoothstep(0.25, 0.75, along);
    return h + (terrain.seaLevel - 0.12 - h) * k;
  };

  const shape01 = (x: number, z: number): number => coast(x, z, landShape01(x, z));
  const landShape01 = (x: number, z: number): number => {
    const n = (fbm(nA, x * freq, z * freq, 5, gain) + 1) / 2;
    const tilt = -0.06 * (z / CORE_HALF);
    switch (terrain.shape) {
      case 'plains': return 0.3 + 0.25 * n;
      case 'hills': return n;
      case 'mountains': return 0.1 * n + 0.9 * Math.pow(ridged(nB, x * freq * 0.4, z * freq * 0.4, 5), 1.5);
      case 'valley': {
        const wall = smoothstep(30, 260, Math.abs(x - meander(z)));
        return 0.15 + 0.2 * n + 0.65 * wall * (0.6 + 0.4 * n) + tilt;
      }
      case 'canyon': {
        const cut = 1 - smoothstep(25, 70, Math.abs(x - meander(z)));
        return 0.65 + 0.15 * n - 0.55 * cut + tilt;
      }
      case 'island': {
        const r = Math.hypot(x, z) / (CORE_HALF * 0.9);
        return clamp(0.55 + 0.35 * n - r * r * 0.75, 0, 1);
      }
    }
  };
  const baseHeight = (x: number, z: number) => shape01(x, z) * amplitude;

  // ---- water ----
  const riverIndex = new SegmentIndex(32);
  let river: Vec2[] = [];
  const lakes: Lake[] = [];
  if (recipe.water.river) {
    if (terrain.shape === 'valley' || terrain.shape === 'canyon') {
      for (let z = -CORE_HALF + 16; z <= CORE_HALF - 16; z += 8) river.push({ x: meander(z), z });
    } else {
      let start: Vec2 = { x: 0, z: 0 };
      let best = -Infinity;
      const lim = CORE_HALF * 0.75;
      for (let x = -lim; x <= lim; x += 32) for (let z = -lim; z <= lim; z += 32) {
        const h = baseHeight(x, z);
        if (h > best) { best = h; start = { x, z }; }
      }
      const res = traceRiver(baseHeight, start, { seaLevelY: hasSea ? seaLevelY : -Infinity, bound: CORE_HALF });
      river = res.path;
      if (res.lake) lakes.push(res.lake);
    }
    if (river.length > 1) riverIndex.addPolyline(river);
  }
  if (recipe.water.lake && lakes.length === 0) {
    let best = Infinity, at: Vec2 = { x: 0, z: 0 };
    const lim = CORE_HALF * 0.7;
    for (let x = -lim; x <= lim; x += 32) for (let z = -lim; z <= lim; z += 32) {
      const h = baseHeight(x, z);
      if (h < best) { best = h; at = { x, z }; }
    }
    lakes.push({ x: at.x, z: at.z, radius: 45, levelY: best + 0.5 });
  }

  const riverDist = (x: number, z: number, range = 48) => (river.length > 1 ? riverIndex.distance(x, z, range) : Infinity);

  const carved = (x: number, z: number): number => {
    let h = baseHeight(x, z);
    const d = riverDist(x, z);
    if (d < RIVER_CARVE_WIDTH) h -= RIVER_DEPTH * (1 - smoothstep(5, RIVER_CARVE_WIDTH, d));
    for (const l of lakes) {
      const dl = Math.hypot(x - l.x, z - l.z);
      if (dl < l.radius * 1.4) h = Math.min(h, lerp(l.levelY - 5, h, smoothstep(l.radius, l.radius * 1.4, dl)));
    }
    return h;
  };

  // ---- pads & roads ----
  const pads: Pad[] = [];
  const roads: Road[] = [];
  const paved: Paved[] = [];
  const roadIndex = new SegmentIndex(32);

  // 0 in the water channel, 1 well clear of it; pad influence fades with this so there is no seam.
  const landWeight = (x: number, z: number): number => {
    let k = smoothstep(RIVER_WET, RIVER_WET + 8, riverDist(x, z, RIVER_WET + 9));
    for (const l of lakes) k = Math.min(k, smoothstep(l.radius, l.radius * 1.3, Math.hypot(x - l.x, z - l.z)));
    return k;
  };

  const heightAt = (x: number, z: number): number => {
    const c = carved(x, z);
    if (pads.length === 0) return c;
    let h = c;
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.radius * 1.8) h = lerp(p.y, h, smoothstep(p.radius, p.radius * 1.8, d));
    }
    return h === c ? c : lerp(c, h, landWeight(x, z));
  };

  const slopeAt = (x: number, z: number): number => {
    const e = 1;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  };

  const isWater = (x: number, z: number): boolean => {
    const s = waterSurfaceAt(x, z);
    return s !== null && heightAt(x, z) < s;
  };

  const waterSurfaceAt = (x: number, z: number): number | null => {
    for (const l of lakes) if (Math.hypot(x - l.x, z - l.z) < l.radius) return l.levelY;
    if (riverDist(x, z) < RIVER_WET) return baseHeight(x, z) - 1.5;
    if (hasSea && heightAt(x, z) < seaLevelY) return seaLevelY;
    return null;
  };

  const waterDistance = (x: number, z: number): number => {
    if (isWater(x, z)) return 0;
    let d = riverDist(x, z, 160) - RIVER_WET;
    for (const l of lakes) d = Math.min(d, Math.hypot(x - l.x, z - l.z) - l.radius);
    if (hasSea) {
      const h = heightAt(x, z);
      d = Math.min(d, (h - seaLevelY) / Math.max(slopeAt(x, z), 0.08));
    }
    return Math.max(0, Math.min(d, 999));
  };

  return {
    recipe, amplitude, seaLevelY, hasSea, river, lakes, pads, roads, paved,
    meander, baseHeight, heightAt, slopeAt, isWater, waterDistance, waterSurfaceAt,
    detailNoise: (x, z) => nD(x, z),
    addPad: (p) => { pads.push({ ...p }); },
    addRoad: (r) => { roads.push(r); roadIndex.addPolyline(r.points); },
    addPaved: (p) => { paved.push({ ...p }); },
    pavedAt: (x, z) => {
      let w = 0;
      for (const p of paved) {
        const dx = x - p.x, dz = z - p.z, c = Math.cos(p.angle), s = Math.sin(p.angle);
        const d = Math.max(Math.abs(dx * c + dz * s), Math.abs(-dx * s + dz * c)) - p.half;
        if (d < PAVED_EDGE) w = Math.max(w, 1 - smoothstep(0, PAVED_EDGE, d));
      }
      return w;
    },
    isReserved: (x, z, margin) => {
      for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return true;
      return roads.length > 0 && roadIndex.distance(x, z, 16 + margin) < 2 + margin;
    },
  };
}

export function snapshotField(f: WorldField): FieldSnapshot {
  return { recipe: f.recipe, pads: f.pads.map((p) => ({ ...p })), roads: f.roads.map((r) => ({ ...r, points: [...r.points], bridges: [...r.bridges] })), paved: f.paved.map((p) => ({ ...p })) };
}

export function restoreField(s: FieldSnapshot): WorldField {
  const f = createField(s.recipe);
  for (const p of s.pads) f.addPad(p);
  for (const r of s.roads) f.addRoad(r);
  for (const p of s.paved ?? []) f.addPaved(p);
  return f;
}
