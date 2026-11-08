import { createNoise2D } from 'simplex-noise';
import { CORE_HALF, type Recipe } from '../core/recipe';
import { RIM_WIDTH } from './mapBounds';
import { mulberry32 } from '../core/rng';
import { clamp, fbm, lerp, ridged, smoothstep } from './noise';
import { longestRun, SegmentIndex, smoothLine, traceRiver, type Lake, type Vec2 } from './river';

/** `open`: a settlement's ground. It is levelled, but trees, grass and props may grow on it, around its plots and roads. */
export interface Pad { x: number; z: number; radius: number; y: number; open?: boolean }
/** The ground a building of a settlement stands on: nothing else grows or stands here. */
export interface Plot { x: number; z: number; radius: number }
/**
 * A farm field beside a settlement: a rectangle along the world's axes (the terrain grid's, so its rows draw clean),
 * with rows along x or z. `crop` picks its colour (world/chunkData).
 */
export interface Crop { x: number; z: number; halfX: number; halfZ: number; rowsAlongX: boolean; crop: number }
/** `paved`: asphalt (city streets, and every road in a world with a city grid); otherwise a dirt road. */
/** `high`: which of its bridges span a gap in the land from lip to lip, rather than crossing water from bank to bank. */
export interface Road { points: Vec2[]; width: number; bridges: boolean[]; high?: boolean[]; paved?: boolean }
/**
 * A paved square (a city grid's blocks): centre, half side, and its turn (radians). `parks`: lots left unpaved, as
 * squares `parkHalf` either side of a point given along and across the square's own axes.
 */
export interface Paved { x: number; z: number; half: number; angle: number; parks?: Array<{ u: number; v: number }>; parkHalf?: number }
/** Paving fades out over this many metres past its edge. */
const PAVED_EDGE = 3;
/** And a park's grass takes over from it across this many metres. */
const PARK_EDGE = 2;

export interface WorldField {
  readonly recipe: Recipe;
  readonly amplitude: number;
  readonly seaLevelY: number;
  /** An ocean world (no land): the height of the wooden decks places float on; null in every other world. */
  readonly deckY: number | null;
  /** On a floating deck (ocean worlds only). */
  isDeck(x: number, z: number): boolean;
  /** The height of the terrain mesh: heightAt, except that an ocean's mesh stays on the sea bed under its decks (render/decks). */
  meshHeightAt(x: number, z: number): number;
  readonly hasSea: boolean;
  readonly river: Vec2[];
  readonly lakes: Lake[];
  readonly pads: Pad[];
  readonly plots: Plot[];
  readonly crops: Crop[];
  readonly roads: Road[];
  readonly paved: Paved[];
  meander(z: number): number;
  baseHeight(x: number, z: number): number;
  heightAt(x: number, z: number): number;
  slopeAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  waterDistance(x: number, z: number): number;
  waterSurfaceAt(x: number, z: number): number | null;
  /** How far (x, z) is from the river's line, or Infinity past `range`. */
  riverDistance(x: number, z: number, range?: number): number;
  /** The river's surface height at its closest point: what its mesh is drawn at. */
  riverLevelAt(x: number, z: number): number;
  detailNoise(x: number, z: number): number;
  addPad(p: Pad): void;
  addPlot(p: Plot): void;
  addCrop(c: Crop): void;
  /** The farm field at (x, z), if any. */
  cropAt(x: number, z: number): Crop | null;
  addRoad(r: Road): void;
  addPaved(p: Paved): void;
  /** 1 on paving (city ground: no grass, no trees, concrete colour), fading to 0 just past its edge and in a park. */
  pavedAt(x: number, z: number): number;
  /** In a city's park: an open lot that grows trees. */
  inPark(x: number, z: number): boolean;
  isReserved(x: number, z: number, margin: number): boolean;
  /** On a settlement's open ground. */
  inSettlement(x: number, z: number): boolean;
  /** Within `margin` of a road's edge, or on it: every road's own width counts (city streets are wider than tracks). */
  isOnRoad(x: number, z: number, margin?: number): boolean;
}

export type FieldSnapshot = { recipe: Recipe; pads: Pad[]; plots?: Plot[]; crops?: Crop[]; roads: Road[]; paved?: Paved[] };

/** Water reaches this far either side of a river's line: its banks stand here. */
export const RIVER_WET = 16;
/** Decks stand this far above the sea: the height of a bridge deck, so boardwalks meet them level. */
const DECK_ABOVE_SEA = 1.2;
/** The river's bed spans this far either side of its line, then rises to its banks at RIVER_WET. */
const RIVER_BED_HALF = 6;
const RIVER_DEPTH = 4;
/** Banks and shores stand this far above their water, so a surface always ends against ground. */
const BANK_ABOVE = 0.4;
/** Past the bank the ground blends back to the land by this distance from the river. */
const RIVER_BLEND_TO = 34;
/** Points either side averaged into a river's level: a surface follows the land's trend, not its every bump. */
const RIVER_SMOOTH = 5;
/** How far below its surface a lake's middle lies. */
const RIVER_MAX_STEP = 2.5;
/** A river's line runs on this many points past the shore, so its mouth opens into the sea. */
const RIVER_INTO_SEA = 2;
/** Around this height above the sea a bank stops being raised: land lower than that is the sea's. */
const BANK_FADES_TO = 1;
const LAKE_ABOVE_SEA = 2;
/** Radii a lake looks for room at, largest first. */
const LAKE_SIZES = [45, 30, 20];
/** A lake's water stands this far below the lowest land around it, so the land holds it with no wall. */
const LAKE_BELOW_LAND = 0.2;
/** How many points around the chosen spot set its level: the land's dips between fewer stood below the water. */
const LAKE_SHORE_SAMPLES = 96;
const LAKE_DEPTH = 6;
/** The mountains at the map's edge: their height, how much it varies, and how much their foot wanders. */
const RIM_HEIGHT = 45;
const RIM_VARY = 12;
const RIM_WANDER = 14;
const LAKE_WET_TO = 0.995;
/** A river takes its lake's level from this many lake radii out. */
const RIVER_JOINS_LAKE = 1.2;
/** And stops this many lake radii from the lake's middle: inside it, so the two surfaces overlap. */
const RIVER_ENDS_IN_LAKE = 0.8;

/** (x, z) along and across a paved square's own axes, from its centre. */
function pavedAxes(p: Paved, x: number, z: number): { u: number; v: number } {
  const dx = x - p.x, dz = z - p.z, c = Math.cos(p.angle), s = Math.sin(p.angle);
  return { u: dx * c + dz * s, v: -dx * s + dz * c };
}

/** How far outside the nearest park of a paved square a point is; negative inside one, Infinity with none. */
function parkDistance(p: Paved, u: number, v: number): number {
  let best = Infinity;
  for (const k of p.parks ?? []) best = Math.min(best, Math.max(Math.abs(u - k.u), Math.abs(v - k.v)) - (p.parkHalf ?? 0));
  return best;
}

export function createField(recipe: Recipe): WorldField {
  const { terrain, seed } = recipe;
  const nA = createNoise2D(mulberry32(seed));
  const nB = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
  const nD = createNoise2D(mulberry32(seed ^ 0x85ebca6b));
  const amplitude = 20 + terrain.height * 140;
  // An ocean always has its sea, whatever level the AI wrote.
  const ocean = terrain.shape === 'ocean';
  const seaLevel = ocean ? Math.max(terrain.seaLevel, 0.5) : terrain.seaLevel;
  const seaLevelY = seaLevel * amplitude;
  const hasSea = seaLevel > 0;
  const deckY = ocean ? seaLevelY + DECK_ABOVE_SEA : null;
  const freq = 1 / (420 - terrain.roughness * 260);
  const gain = 0.42 + terrain.roughness * 0.18;

  const meander = (z: number) => 140 * nB(z * 0.0015, 11.7);

  // A sea on a world that is not an island needs a coast: the land falls below sea level toward one side (from the
  // seed), wavy, so "a city by the sea" really has a waterfront. Before this, plains (never below 0.3) had no sea at all.
  const coastAngle = mulberry32(seed ^ 0x27d4eb2f)() * Math.PI * 2;
  const coastX = Math.cos(coastAngle), coastZ = Math.sin(coastAngle);
  const coast = (x: number, z: number, h: number): number => {
    if (!hasSea || terrain.shape === 'island' || terrain.shape === 'archipelago' || ocean) return h;
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
      // No land at all: a sea bed 7-12 m down everywhere; pads are wooden decks standing on posts (render/decks).
      case 'ocean': return seaLevel - (7 + 5 * n) / amplitude;
      case 'archipelago': {
        // Islets 40-150 m across scattered over open sea: a finer noise breaks the surface only at its crests, with
        // a small island kept at the centre so the player always has somewhere to start. Measured from sea level,
        // so about a fifth is land whatever seaLevel the AI picks (0.55 had left 38% land).
        const isle = (fbm(nB, x / 150 + 3.7, z / 150 - 1.9, 4, 0.5) + 1) / 2;
        const heart = Math.max(0, 1 - Math.hypot(x, z) / 75);
        return clamp(terrain.seaLevel + 0.75 * (isle - 0.627) + 0.1 * (n - 0.5) + 0.3 * heart * heart, 0, 1);
      }
    }
  };
  const baseHeight = (x: number, z: number) => shape01(x, z) * amplitude;

  // ---- water ----
  const riverIndex = new SegmentIndex(32);
  let river: Vec2[] = [];
  const lakes: Lake[] = [];
  /** A lake lies on land: lower than the sea, it would be a disc of water on the sea bed. */
  const aboveSea = (y: number) => !hasSea || y > seaLevelY + LAKE_ABOVE_SEA;
  /** The land around a lake here: its lowest and highest. Water higher than the lowest would need a wall to hold it. */
  const lakeGround = (x: number, z: number, radius: number, around = 16): { low: number; high: number } => {
    let low = baseHeight(x, z), high = low;
    for (const k of [0.5, 1, 1.2, 1.4]) for (let a = 0; a < around; a++) {
      const h = baseHeight(x + Math.cos((a / around) * Math.PI * 2) * radius * k, z + Math.sin((a / around) * Math.PI * 2) * radius * k);
      low = Math.min(low, h); high = Math.max(high, h);
    }
    return { low, high };
  };
  if (recipe.water.river && !ocean) {
    if (terrain.shape === 'valley' || terrain.shape === 'canyon') {
      for (let z = -CORE_HALF + 16; z <= CORE_HALF - 16; z += 8) river.push({ x: meander(z), z });
      // Land flooded by the sea has no river on it, only the stretch that runs between its shores.
      if (hasSea) river = longestRun(river, (p) => baseHeight(p.x, p.z) > seaLevelY, RIVER_INTO_SEA);
    } else {
      let start: Vec2 = { x: 0, z: 0 };
      let best = -Infinity;
      const lim = CORE_HALF * 0.75;
      for (let x = -lim; x <= lim; x += 32) for (let z = -lim; z <= lim; z += 32) {
        const h = baseHeight(x, z);
        if (h > best) { best = h; start = { x, z }; }
      }
      const res = traceRiver(baseHeight, start, { seaLevelY: hasSea ? seaLevelY : -Infinity, bound: CORE_HALF });
      river = smoothLine(res.path);
      const levelY = res.lake ? Math.min(res.lake.levelY, lakeGround(res.lake.x, res.lake.z, res.lake.radius, LAKE_SHORE_SAMPLES).low - LAKE_BELOW_LAND) : 0;
      if (res.lake && aboveSea(levelY)) {
        lakes.push({ ...res.lake, levelY });
        // A river ends where it reaches its lake. Traced on, it wandered about under the surface, and the channel it
        // carves reached past the shore: a ring of dry, dark river bed around the lake.
        const l = res.lake, enters = river.findIndex((p) => Math.hypot(p.x - l.x, p.z - l.z) < l.radius * RIVER_ENDS_IN_LAKE);
        if (enters >= 1) river = river.slice(0, enters + 1);
      }
    }
    if (river.length > 1) riverIndex.addPolyline(river);
  }
  if (recipe.water.lake && lakes.length === 0 && !ocean) {
    const lim = CORE_HALF * 0.7;
    for (const radius of LAKE_SIZES) {
      // Low, level ground: on a slope the uphill side would be a cut wall.
      let best = Infinity, lake: Lake | null = null;
      for (let x = -lim; x <= lim; x += 32) for (let z = -lim; z <= lim; z += 32) {
        const { low, high } = lakeGround(x, z, radius);
        if (aboveSea(low - LAKE_BELOW_LAND) && high < best) { best = high; lake = { x, z, radius, levelY: 0 }; }
      }
      if (lake) { lakes.push({ ...lake, levelY: lakeGround(lake.x, lake.z, radius, LAKE_SHORE_SAMPLES).low - LAKE_BELOW_LAND }); break; }
    }
  }

  const riverDist = (x: number, z: number, range = 48) => (river.length > 1 ? riverIndex.distance(x, z, range) : Infinity);

  // Each river point's surface height. One height per point across the whole width: measuring the land to either side
  // cannot work for a sheet, so the land is shaped to it instead (carved). A river arrives at its lake's level, so their
  // shores join; inside the lake it stays just below, out of sight, and the lake's bowl shapes the ground.
  const underSea = (p: Vec2) => hasSea && baseHeight(p.x, p.z) < seaLevelY;
  const riverLevels = new Map<Vec2, number>();
  const levels = river.map((p, i) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - RIVER_SMOOTH); k <= Math.min(river.length - 1, i + RIVER_SMOOTH); k++) { sum += baseHeight(river[k].x, river[k].z) - 1.5; n++; }
    let level = sum / n;
    if (hasSea) level = underSea(p) ? seaLevelY : Math.max(level, seaLevelY);
    for (const l of lakes) {
      const dl = Math.hypot(p.x - l.x, p.z - l.z);
      if (dl < l.radius) level = l.levelY - 1;
      else if (dl < l.radius * RIVER_JOINS_LAKE) level = l.levelY;
    }
    return level;
  });
  // A rise or fall steeper than this between neighbouring points is drawn as a slope, the land cut or filled to match.
  // A lake's level is fixed, and so is the sea's: the river adapts to them.
  const fixed = river.map((p) => underSea(p) || lakes.some((l) => Math.hypot(p.x - l.x, p.z - l.z) < l.radius * RIVER_JOINS_LAKE));
  for (let i = 1; i < levels.length; i++) if (!fixed[i]) levels[i] = clamp(levels[i], levels[i - 1] - RIVER_MAX_STEP, levels[i - 1] + RIVER_MAX_STEP);
  for (let i = levels.length - 2; i >= 0; i--) if (!fixed[i]) levels[i] = clamp(levels[i], levels[i + 1] - RIVER_MAX_STEP, levels[i + 1] + RIVER_MAX_STEP);
  river.forEach((p, i) => riverLevels.set(p, levels[i]));
  /** Just outside a lake, the nearest stretch may be the hidden one inside it: there the river is at the lake's level. */
  const levelOf = (n: { a: Vec2; b: Vec2; t: number }, x: number, z: number): number => {
    if (underSea({ x, z })) return seaLevelY;
    let level = lerp(riverLevels.get(n.a)!, riverLevels.get(n.b)!, n.t);
    for (const l of lakes) {
      const dl = Math.hypot(x - l.x, z - l.z);
      if (dl >= l.radius && dl < l.radius * 1.4) level = Math.max(level, l.levelY);
    }
    return level;
  };
  const riverLevelAt = (x: number, z: number): number => {
    const n = river.length > 1 ? riverIndex.nearest(x, z, 64) : null;
    return n ? levelOf(n, x, z) : baseHeight(x, z) - 1.5;
  };

  /** Land rises to mountains at the edge of the map; a sea stays open, with no wall standing in the water. */
  const rimAt = (x: number, z: number, h: number): number => {
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge < CORE_HALF - RIM_WIDTH - RIM_WANDER) return 0;
    const k = smoothstep(CORE_HALF - RIM_WIDTH, CORE_HALF, edge + nD(x * 0.012, z * 0.012) * RIM_WANDER);
    const land = hasSea ? smoothstep(seaLevelY, seaLevelY + 6, h) : 1;
    return k * k * land * (RIM_HEIGHT + nA(x * 0.01, z * 0.01) * RIM_VARY);
  };

  /**
   * The land with its water's shape cut in. A surface is flat and the land is not, so the ground is set from the surface:
   * bed, then a bank just above the water, then back to the land. Before, the river's bed was the land minus a few metres
   * and a lake was deepest right at its shore, so their sheets hung over dry ground, up to 15 m in the air, and the
   * player walked about under them.
   */
  const carved = (x: number, z: number): number => {
    let h = baseHeight(x, z);
    let inLake = false;
    for (const l of lakes) {
      const dl = Math.hypot(x - l.x, z - l.z);
      if (dl >= l.radius * 1.4) continue;
      inLake ||= dl < l.radius;
      const shore = l.levelY + BANK_ABOVE, edge = l.radius * LAKE_WET_TO;
      // Wet right up to the edge of the disc, then a short rise to the shore that hides it.
      if (dl < edge) h = lerp(l.levelY - LAKE_DEPTH, l.levelY - 0.1, smoothstep(l.radius * 0.5, edge, dl));
      else if (dl < l.radius) h = lerp(l.levelY - 0.1, shore, (dl - edge) / (l.radius - edge));
      else h = lerp(shore, h, smoothstep(l.radius, l.radius * 1.4, dl));
    }
    const n = river.length > 1 ? riverIndex.nearest(x, z, RIVER_BLEND_TO) : null;
    if (n) {
      const level = levelOf(n, x, z), bank = level + BANK_ABOVE;
      const shaped = n.distance < RIVER_WET ? lerp(level - RIVER_DEPTH, bank, smoothstep(RIVER_BED_HALF, RIVER_WET, n.distance)) : lerp(bank, h, smoothstep(RIVER_WET, RIVER_BLEND_TO, n.distance));
      // A channel only cuts into what is under the sea. Its banks would raise a causeway across the water, walling the sea off.
      if (inLake) h = Math.min(h, shaped); // through the lake's shore too, or a sill of ground dams the river's mouth
      else h = hasSea ? lerp(Math.min(h, shaped), shaped, smoothstep(seaLevelY - 0.2, seaLevelY + BANK_FADES_TO, h)) : shaped;
    }
    return h + rimAt(x, z, h);
  };

  // ---- pads & roads ----
  const pads: Pad[] = [];
  const plots: Plot[] = [];
  const crops: Crop[] = [];
  const roads: Road[] = [];
  const paved: Paved[] = [];
  /** One index per road width, so a point is measured against the edge of the road it is near. */
  const roadIndexes = new Map<number, SegmentIndex>();
  const isOnRoad = (x: number, z: number, margin = 0): boolean => {
    for (const [width, index] of roadIndexes) if (index.distance(x, z, 16 + margin) < width / 2 + margin) return true;
    return false;
  };

  // 0 in the water channel, 1 well clear of it; pad influence fades with this so there is no seam.
  const landWeight = (x: number, z: number): number => {
    let k = smoothstep(RIVER_WET, RIVER_WET + 8, riverDist(x, z, RIVER_WET + 9));
    for (const l of lakes) k = Math.min(k, smoothstep(l.radius, l.radius * 1.3, Math.hypot(x - l.x, z - l.z)));
    return k;
  };

  const isDeck = (x: number, z: number): boolean => ocean && pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius);

  const heightAt = (x: number, z: number): number => {
    const c = carved(x, z);
    if (pads.length === 0) return c;
    // A deck is a flat structure over the sea, not a mound of land blending into it: only logic stands on this height.
    if (ocean) return isDeck(x, z) ? deckY! : c;
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
    if (riverDist(x, z) < RIVER_WET) return riverLevelAt(x, z);
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
    recipe, amplitude, seaLevelY, deckY, isDeck, meshHeightAt: (x, z) => (ocean ? carved(x, z) : heightAt(x, z)), hasSea, river, lakes, pads, plots, crops, roads, paved,
    meander, baseHeight, heightAt, slopeAt, isWater, waterDistance, waterSurfaceAt, riverDistance: riverDist, riverLevelAt,
    detailNoise: (x, z) => nD(x, z),
    addPad: (p) => { pads.push({ ...p }); },
    addPlot: (p) => { plots.push({ ...p }); },
    addCrop: (c) => { crops.push({ ...c }); },
    cropAt: (x, z) => crops.find((c) => Math.abs(x - c.x) < c.halfX && Math.abs(z - c.z) < c.halfZ) ?? null,
    addRoad: (r) => {
      roads.push(r);
      let index = roadIndexes.get(r.width);
      if (!index) { index = new SegmentIndex(32); roadIndexes.set(r.width, index); }
      index.addPolyline(r.points);
    },
    isOnRoad,
    addPaved: (p) => { paved.push({ ...p }); },
    pavedAt: (x, z) => {
      let w = 0;
      for (const p of paved) {
        const { u, v } = pavedAxes(p, x, z);
        const d = Math.max(Math.abs(u), Math.abs(v)) - p.half;
        if (d < PAVED_EDGE) w = Math.max(w, (1 - smoothstep(0, PAVED_EDGE, d)) * smoothstep(-PARK_EDGE, 0, parkDistance(p, u, v)));
      }
      return w;
    },
    inPark: (x, z) => paved.some((p) => {
      const { u, v } = pavedAxes(p, x, z);
      return parkDistance(p, u, v) < -PARK_EDGE;
    }),
    isReserved: (x, z, margin) => {
      for (const p of pads) if (!p.open && Math.hypot(x - p.x, z - p.z) < p.radius + margin) return true;
      for (const p of plots) if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return true;
      return isOnRoad(x, z, margin);
    },
    inSettlement: (x, z) => pads.some((p) => p.open && Math.hypot(x - p.x, z - p.z) < p.radius),
  };
}

export function snapshotField(f: WorldField): FieldSnapshot {
  return { recipe: f.recipe, pads: f.pads.map((p) => ({ ...p })), plots: f.plots.map((p) => ({ ...p })), crops: f.crops.map((c) => ({ ...c })), roads: f.roads.map((r) => ({ ...r, points: [...r.points], bridges: [...r.bridges] })), paved: f.paved.map((p) => ({ ...p })) };
}

export function restoreField(s: FieldSnapshot): WorldField {
  const f = createField(s.recipe);
  for (const p of s.pads) f.addPad(p);
  for (const p of s.plots ?? []) f.addPlot(p);
  for (const c of s.crops ?? []) f.addCrop(c);
  for (const r of s.roads) f.addRoad(r);
  for (const p of s.paved ?? []) f.addPaved(p);
  return f;
}
