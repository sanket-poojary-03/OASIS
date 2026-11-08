import type { Interaction, Place } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import { biomeAt, type Biome } from './biome';
import type { Crop, Road, WorldField } from './field';
import { DEFAULT_LOW, heightFor, layoutGroup, memberAsset, type GroupLayout } from './layouts';
import type { Placement } from './placement';
import type { Vec2 } from './river';
import { isClearOfWater } from './waterDepth';

export interface Building {
  id: string;
  placeId: string;
  x: number;
  z: number;
  y: number;
  rotation: number;
  /** 'house' is any member of the group (a house, tower, tent, tree…); 'centre' a layout's centre piece. */
  kind: 'house' | 'well' | 'market' | 'centre';
  asset: string;
  footprint: number;
  interaction: Interaction;
  /** Metres; absent = the place size's house height. */
  height?: number;
  /** Widest the model may be (its plot); absent = no limit. */
  maxWidth?: number;
}

export const HOUSE_FOOTPRINT = 5;
export const CENTRE_FOOTPRINT = 3;
/** Max slope (rise over run) under any footprint sample. */
export const SITE_SLOPE_MAX = 0.3;
/** Min centre-to-centre distance between any two houses. */
export const MIN_HOUSE_SPACING = 12;
/** Min distance from a house to the well or market. */
export const MIN_CENTRE_CLEARANCE = 9;
const CAP = { small: 6, medium: 12, large: 20 } as const;
/** Side lanes a village grows, by size. */
const LANES = { small: 1, medium: 2, large: 4 } as const;
const STREET_STEP = 6;
const STREET_WIDTH = 4;
const LANE_WIDTH = 3;
/** The street wanders by up to this share of the village's radius, at most VILLAGE_BEND_MAX metres. */
const VILLAGE_BEND = 0.14;
const VILLAGE_BEND_MAX = 9;
/** How far along the street the lanes branch off, as shares of its half length (alternating sides). */
const LANE_AT = [0.32, -0.4, 0.62, -0.68];
const LANE_LENGTH = 0.6;
const LANE_MIN_POINTS = 3;
/** One house every this many metres of road; never closer than MIN_HOUSE_SPACING to another. */
const HOUSE_STEP = 13;
/** How far a house's middle stands from the road it faces: first choice, then further back. */
const SET_BACK = [8.5, 10.5, 13];
/** Free ground between a house's footprint and any road but the one it faces. */
const ROAD_MARGIN = 3;
/** A row of houses is never quite straight. */
const TURN_JITTER = 0.2;
const CENTRE_ALONG = [0, 8, -8];
const CENTRE_LATERAL = [6, -6, 9, -9];
/** Widest a village house may be: wider ones would reach the road they face. */
const HOUSE_MAX_WIDTH = 11;
/** How many farm fields a village works, by size, and how big they are (half a side, in metres). */
const FIELDS = { small: 2, medium: 4, large: 6 } as const;
const FIELD_MIN = 10;
const FIELD_VARY = 8;
const FIELD_SLOPE = 0.2;
const FIELD_MARGIN = 2;
const FIELD_GAP = 3;

/** Centre plus the four corners of a square footprint of side `fp`. */
export function footprintSamples(x: number, z: number, fp: number): Array<{ x: number; z: number }> {
  const h = fp / 2;
  return [{ x, z }, { x: x + h, z: z + h }, { x: x + h, z: z - h }, { x: x - h, z: z + h }, { x: x - h, z: z - h }];
}

/** True when every footprint sample is dry and under the slope limit. */
export function siteIsDry(field: WorldField, x: number, z: number, fp: number): boolean {
  return footprintSamples(x, z, fp).every((s) => !field.isWater(s.x, s.z) && field.slopeAt(s.x, s.z) <= SITE_SLOPE_MAX);
}

/** Distance from (x, z) to the centre line of `points`. */
function distanceTo(points: Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

const road = (points: Vec2[], width: number): Road => ({ points, width, bridges: points.slice(1).map(() => false) });

/** One road's slots for houses, a step apart on both sides, each with the spots it could use and the way it would face. */
function slotsAlong(r: Road, rng: () => number): Array<{ spots: Vec2[]; rotation: number }> {
  const out: Array<{ spots: Vec2[]; rotation: number }> = [];
  let next = HOUSE_STEP / 2;
  let walked = 0;
  for (let i = 0; i + 1 < r.points.length; i++) {
    const a = r.points[i], b = r.points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (; next <= walked + len; next += HOUSE_STEP) {
      const f = (next - walked) / len, px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
      for (const s of [-1, 1]) {
        const rotation = Math.atan2(-nx * s, -nz * s) + (rng() - 0.5) * TURN_JITTER;
        out.push({ spots: SET_BACK.map((lat) => ({ x: px + nx * s * lat, z: pz + nz * s * lat })), rotation });
      }
    }
    walked += len;
  }
  return out;
}

/**
 * A village: one street wandering through its middle, side lanes branching off it, a well or market by the street, and
 * houses that face the nearest road, filled from the middle outward so a small village stays together instead of being
 * strung along the whole street.
 */
export function layoutSettlement(place: Place, pl: Placement, field: WorldField, seed: number): GroupLayout {
  if (place.layout && place.layout.pattern !== 'village') return layoutGroup(place, place.layout, pl, field, seed);
  const rng = mulberry32(seed ^ hashString(`${place.id}:layout`));
  const angle = rng() * Math.PI;
  const dir = { x: Math.cos(angle), z: Math.sin(angle) };
  const side = { x: -dir.z, z: dir.x };
  const half = pl.radius * 0.9;
  const bend = Math.min(VILLAGE_BEND_MAX, pl.radius * VILLAGE_BEND);
  const phase = rng() * Math.PI * 2;
  const inRadius = (x: number, z: number) => Math.hypot(x - pl.x, z - pl.z) <= pl.radius;

  /** The street's point `along` metres from the village's middle; it stays on the middle at 0, and wanders either side. */
  const streetAt = (along: number): Vec2 => {
    const off = bend * (Math.sin(phase + (along / half) * Math.PI * 1.2) - Math.sin(phase));
    return { x: pl.x + dir.x * along + side.x * off, z: pl.z + dir.z * along + side.z * off };
  };
  /** Outward from the middle until water, so no street ever runs into a river. */
  const dryRun = (sign: number): Vec2[] => {
    const out: Vec2[] = [];
    for (let s = STREET_STEP; s <= half; s += STREET_STEP) {
      const p = streetAt(sign * s);
      if (!isClearOfWater(field, p.x, p.z, STREET_WIDTH / 2 + 0.5)) break;
      out.push(p);
    }
    return out;
  };
  const back = dryRun(-1).reverse(), fwd = dryRun(1);
  const points = [...back, streetAt(0), ...fwd];
  if (points.length < 2) points.push({ x: pl.x + dir.x, z: pl.z + dir.z });
  const spine = road(points, STREET_WIDTH);

  const streets: Road[] = [];
  for (let k = 0; k < LANES[place.size]; k++) {
    const along = LANE_AT[k] * half, sign = k % 2 ? 1 : -1, from = streetAt(along);
    const length = half * LANE_LENGTH, curl = (rng() - 0.5) * 0.6;
    const lane: Vec2[] = [from];
    for (let s = STREET_STEP; s <= length; s += STREET_STEP) {
      const t = s / length;
      const x = from.x + side.x * sign * s + dir.x * curl * s * t, z = from.z + side.z * sign * s + dir.z * curl * s * t;
      if (!isClearOfWater(field, x, z, LANE_WIDTH / 2 + 0.5) || !inRadius(x, z)) break;
      lane.push({ x, z });
    }
    if (lane.length >= LANE_MIN_POINTS) streets.push(road(lane, LANE_WIDTH));
  }
  const allRoads = [spine, ...streets];

  // Centre well or market, just off the street: first dry spot wins, the place centre is the last resort.
  const centreKind = place.size === 'large' ? 'market' : 'well';
  const centreSpots: Vec2[] = [];
  for (const lat of CENTRE_LATERAL) for (const along of CENTRE_ALONG) {
    const p = streetAt(along);
    centreSpots.push({ x: p.x + side.x * lat, z: p.z + side.z * lat });
  }
  centreSpots.push({ x: pl.x, z: pl.z });
  const clearOfRoads = (x: number, z: number, fp: number) => allRoads.every((r) => distanceTo(r.points, x, z) >= r.width / 2 + fp / 2);
  const centre = centreSpots.find((c) => inRadius(c.x, c.z) && siteIsDry(field, c.x, c.z, CENTRE_FOOTPRINT) && clearOfRoads(c.x, c.z, CENTRE_FOOTPRINT)) ?? centreSpots[centreSpots.length - 1];
  const buildings: Building[] = [{
    id: `${place.id}-centre`, placeId: place.id, x: centre.x, z: centre.z, y: field.heightAt(centre.x, centre.z),
    rotation: Math.atan2(-side.x, -side.z), kind: centreKind,
    asset: centreKind === 'market' ? 'market stall' : 'stone well', footprint: CENTRE_FOOTPRINT, interaction: 'none',
  }];

  const assetOf = memberAsset(place, seed);
  const houseInteraction: Interaction = place.interaction !== 'none' ? place.interaction : 'door';
  const cap = place.layout?.count ?? CAP[place.size];
  const fits = (x: number, z: number) => inRadius(x, z)
    && Math.hypot(x - centre.x, z - centre.z) >= MIN_CENTRE_CLEARANCE
    && allRoads.every((r) => distanceTo(r.points, x, z) >= r.width / 2 + HOUSE_FOOTPRINT / 2 + ROAD_MARGIN)
    && siteIsDry(field, x, z, HOUSE_FOOTPRINT)
    && buildings.every((b) => Math.hypot(x - b.x, z - b.z) >= MIN_HOUSE_SPACING);
  const slots = allRoads.flatMap((r) => slotsAlong(r, rng));
  const fromMiddle = (s: { spots: Vec2[] }) => Math.hypot(s.spots[0].x - pl.x, s.spots[0].z - pl.z);
  // A slot that cannot take a house now may be free for a later one: nothing is decided until a house stands in it.
  for (const slot of slots.sort((a, b) => fromMiddle(a) - fromMiddle(b))) {
    if (buildings.length - 1 >= cap) break;
    const spot = slot.spots.find((s) => fits(s.x, s.z));
    if (!spot) continue;
    const n = buildings.length - 1;
    buildings.push({
      id: `${place.id}-house-${n}`, placeId: place.id, x: spot.x, z: spot.z, y: field.heightAt(spot.x, spot.z),
      rotation: slot.rotation, kind: 'house', asset: assetOf(n), footprint: HOUSE_FOOTPRINT, interaction: houseInteraction,
      height: heightFor(place.layout ?? DEFAULT_LOW, place.size, rng, 0), maxWidth: HOUSE_MAX_WIDTH,
    });
  }
  return { buildings, spine, streets, lampSpots: [], crops: farmFields(place, pl, field, rng, allRoads, buildings) };
}

/** Where farming makes sense: not a beach, a snowfield or a desert. */
const FARMLAND: ReadonlySet<Biome> = new Set(['grass', 'forest']);

/** Patches of farmland around a village, just past its last houses: on dry, gentle ground, off its streets and off each other. */
function farmFields(place: Place, pl: Placement, field: WorldField, rng: () => number, roads: Road[], buildings: Building[]): Crop[] {
  if (field.deckY !== null) return [];
  const out: Crop[] = [];
  const wanted = FIELDS[place.size];
  for (let tries = 0; tries < wanted * 24 && out.length < wanted; tries++) {
    const a = rng() * Math.PI * 2, d = pl.radius * (0.7 + rng() * 0.9);
    const x = Math.round((pl.x + Math.cos(a) * d) / 2) * 2, z = Math.round((pl.z + Math.sin(a) * d) / 2) * 2;
    const halfX = FIELD_MIN + Math.round(rng() * FIELD_VARY), halfZ = FIELD_MIN + Math.round(rng() * FIELD_VARY);
    const crop: Crop = { x, z, halfX, halfZ, rowsAlongX: rng() < 0.5, crop: Math.floor(rng() * 4) };
    const corners = [[0, 0], [halfX, halfZ], [halfX, -halfZ], [-halfX, halfZ], [-halfX, -halfZ], [halfX, 0], [-halfX, 0], [0, halfZ], [0, -halfZ]];
    const fits = corners.every(([dx, dz]) => !field.isWater(x + dx, z + dz) && field.slopeAt(x + dx, z + dz) < FIELD_SLOPE && FARMLAND.has(biomeAt(field, x + dx, z + dz)))
      && corners.every(([dx, dz]) => roads.every((r) => distanceTo(r.points, x + dx, z + dz) > r.width / 2 + FIELD_MARGIN))
      && buildings.every((b) => Math.abs(b.x - x) > halfX + b.footprint / 2 + FIELD_MARGIN + 3 || Math.abs(b.z - z) > halfZ + b.footprint / 2 + FIELD_MARGIN + 3)
      && field.pads.every((p) => p.open || Math.hypot(Math.max(0, Math.abs(p.x - x) - halfX), Math.max(0, Math.abs(p.z - z) - halfZ)) > p.radius + FIELD_MARGIN)
      && out.every((c) => Math.abs(c.x - x) > c.halfX + halfX + FIELD_GAP || Math.abs(c.z - z) > c.halfZ + halfZ + FIELD_GAP);
    if (fits) out.push(crop);
  }
  return out;
}
