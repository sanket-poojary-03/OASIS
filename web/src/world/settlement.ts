import type { Interaction, Place } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Road, WorldField } from './field';
import { layoutGroup, memberAsset, type GroupLayout } from './layouts';
import type { Placement } from './placement';

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
export const MIN_HOUSE_SPACING = 6;
/** Min distance from a house to the well or market. */
export const MIN_CENTRE_CLEARANCE = 9;
const T_STEP = 13;
const LATERAL = [10, 13, 16];
const CENTRE_LATERAL = [7, -7, 10, -10];
const CENTRE_ALONG = [0, 8, -8];
const SPINE_STEP = 2;
const CAP = { small: 6, medium: 12, large: 20 } as const;

/** Centre plus the four corners of a square footprint of side `fp`. */
export function footprintSamples(x: number, z: number, fp: number): Array<{ x: number; z: number }> {
  const h = fp / 2;
  return [{ x, z }, { x: x + h, z: z + h }, { x: x + h, z: z - h }, { x: x - h, z: z + h }, { x: x - h, z: z - h }];
}

/** True when every footprint sample is dry and under the slope limit. */
export function siteIsDry(field: WorldField, x: number, z: number, fp: number): boolean {
  return footprintSamples(x, z, fp).every((s) => !field.isWater(s.x, s.z) && field.slopeAt(s.x, s.z) <= SITE_SLOPE_MAX);
}

/** Longest dry run along the spine axis from the placement centre, so the spine never crosses water. */
function dryExtent(field: WorldField, pl: Placement, dir: { x: number; z: number }, half: number): { back: number; fwd: number } {
  const run = (sign: number): number => {
    let d = 0;
    for (let s = SPINE_STEP; s <= half; s += SPINE_STEP) {
      if (field.isWater(pl.x + dir.x * sign * s, pl.z + dir.z * sign * s)) break;
      d = s;
    }
    return d;
  };
  return { back: run(-1), fwd: run(1) };
}

export function layoutSettlement(place: Place, pl: Placement, field: WorldField, seed: number): GroupLayout {
  if (place.layout && place.layout.pattern !== 'village') return layoutGroup(place, place.layout, pl, field, seed);
  const rng = mulberry32(seed ^ hashString(`${place.id}:layout`));
  const angle = rng() * Math.PI;
  const dir = { x: Math.cos(angle), z: Math.sin(angle) };
  const side = { x: -dir.z, z: dir.x };
  const half = pl.radius * 0.9;
  const ext = dryExtent(field, pl, dir, half);
  const spine: Road = {
    points: [
      { x: pl.x - dir.x * ext.back, z: pl.z - dir.z * ext.back },
      { x: pl.x + dir.x * ext.fwd, z: pl.z + dir.z * ext.fwd },
    ],
    width: 4,
    bridges: [false],
  };
  const inRadius = (x: number, z: number) => Math.hypot(x - pl.x, z - pl.z) <= pl.radius;

  // Centre well or market: first dry candidate wins, the place centre is the last resort.
  const centreKind = place.size === 'large' ? 'market' : 'well';
  const centreSpots: Array<{ x: number; z: number }> = [];
  for (const lat of CENTRE_LATERAL) for (const along of CENTRE_ALONG) {
    centreSpots.push({ x: pl.x + side.x * lat + dir.x * along, z: pl.z + side.z * lat + dir.z * along });
  }
  centreSpots.push({ x: pl.x, z: pl.z });
  const centre = centreSpots.find((c) => inRadius(c.x, c.z) && siteIsDry(field, c.x, c.z, CENTRE_FOOTPRINT)) ?? centreSpots[centreSpots.length - 1];
  const cx = centre.x, cz = centre.z;
  const buildings: Building[] = [{
    id: `${place.id}-centre`, placeId: place.id, x: cx, z: cz, y: field.heightAt(cx, cz),
    rotation: Math.atan2(-side.x, -side.z), kind: centreKind,
    asset: centreKind === 'market' ? 'market stall' : 'stone well', footprint: CENTRE_FOOTPRINT, interaction: 'none',
  }];

  const assetOf = memberAsset(place, seed);
  const houseInteraction: Interaction = place.interaction !== 'none' ? place.interaction : 'door';
  const cap = place.layout?.count ?? CAP[place.size];
  const tryHouse = (t: number, s: number, jitter: number): boolean => {
    for (const lat of LATERAL) {
      const x = pl.x + dir.x * (t + jitter) + side.x * s * lat;
      const z = pl.z + dir.z * (t + jitter) + side.z * s * lat;
      if (Math.hypot(x - cx, z - cz) < MIN_CENTRE_CLEARANCE) continue;
      if (!inRadius(x, z)) continue;
      if (!siteIsDry(field, x, z, HOUSE_FOOTPRINT)) continue;
      if (buildings.some((b) => Math.hypot(x - b.x, z - b.z) < MIN_HOUSE_SPACING)) continue;
      buildings.push({
        id: `${place.id}-house-${buildings.length - 1}`, placeId: place.id, x, z, y: field.heightAt(x, z),
        rotation: Math.atan2(-side.x * s, -side.z * s), kind: 'house',
        asset: assetOf(buildings.length - 1), footprint: HOUSE_FOOTPRINT, interaction: houseInteraction,
      });
      return true;
    }
    return false;
  };
  const houses = () => buildings.length - 1;

  // Pass 1 fills the main grid; pass 2 adds houses between grid slots where space is left.
  for (const offset of [0, T_STEP / 2]) {
    for (let t = -half + 8 + offset; t <= half - 8 && houses() < cap; t += T_STEP) {
      for (const s of [-1, 1]) {
        if (houses() >= cap) break;
        const jitter = (rng() - 0.5) * 3;
        tryHouse(t, s, jitter);
      }
    }
  }
  return { buildings, spine, streets: [], lampSpots: [] };
}
