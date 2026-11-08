import type { PlaceProp, PlaceSize, Recipe } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Road, WorldField } from './field';
import type { Spot } from './layouts';
import type { Placement } from './placement';
import type { Building } from './settlement';

/** A small thing scattered around its place (barrels by the market, benches in the plaza): the recipe's place.props. */
export interface Extra { id: string; placeId: string; asset: string; size: PlaceSize; x: number; y: number; z: number; rotation: number }

/** A group's streets, buildings and lamp spots. `kerbs`: every prop of a city or high street goes along its kerbs, not in a ring; elsewhere only its lamps do. */
export interface StreetGroup { streets: Road[]; buildings: Building[]; lampSpots: Spot[]; kerbs?: boolean }

/** The most props one world scatters besides street lamps (each is a model, a draw call or few, and a collider). */
export const MAX_EXTRAS = 120;
/** Street lamps have their own budget (a lit city matters more than one more bench): per group, nearest its centre
 * first, and per world, biggest grids first. */
export const MAX_LAMPS = 24;
export const MAX_WORLD_LAMPS = 48;
/** Props keep this far apart, and this far from the place's own centre. */
const SPACING = 2.5;
/** Lamps along a street light it evenly: three together are a glare, and the stretch beyond them dark. */
const LAMP_SPACING = 16;
const TRIES = 14;
/** Kerb props stand this far past the asphalt edge; parked vehicles this far inside it. */
const KERB_OUT = 1;
const PARK_IN = 1.3;
/** How far a prop's middle keeps from a road's edge, by its size; a parked vehicle keeps this far from other streets. */
const ROAD_GAP: Record<PlaceSize, number> = { small: 1, medium: 2, large: 3.5 };
const KERB_GAP = 0.6;
const PARKED_GAP = 3.5;
export const LAMP = /lamp|light|lantern|lamppost/i;
export const VEHICLE = /\b(car|cars|jeep|truck|van|bus|taxi|buggy|rover|shuttle|vehicle)\b/i;

/** Distance from (x, z) to the edge of `road` (negative on it). */
function roadGap(road: Road, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < road.points.length; i++) {
    const a = road.points[i], b = road.points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best - road.width / 2;
}

const clearOfBuildings = (buildings: Building[], x: number, z: number) =>
  buildings.every((b) => Math.hypot(b.x - x, b.z - z) >= b.footprint / 2 + 0.8);

/**
 * Deterministic positions for every place's props: on dry, gentle, free ground (never on a road, a building plot or
 * another prop) in a ring around the place, facing it. A city grid or high street puts them along its kerbs instead
 * (parked cars on the street edge), and every grid crossing gets a street lamp. The AI only says what and how many;
 * code decides where.
 */
export function scatterProps(recipe: Recipe, placements: Placement[], field: WorldField, groups: ReadonlyMap<string, StreetGroup> = new Map()): Extra[] {
  const out: Extra[] = [];
  let lampsSoFar = 0;
  const free = (x: number, z: number) => !field.isWater(x, z) && out.every((e) => Math.hypot(e.x - x, e.z - z) >= SPACING);
  const lamps: Array<{ size: number; add: () => void }> = [];
  for (const place of recipe.places) {
    const pl = placements.find((p) => p.id === place.id);
    if (!pl) continue;
    const group = groups.get(place.id);
    const props = place.props ?? [];
    if (group?.lampSpots.length) {
      // The AI's own lamp (a "neon street light") lights the crossings; otherwise a plain street lamp.
      const lamp = props.find((p) => LAMP.test(p.asset));
      lamps.push({ size: group.lampSpots.length, add: () => streetLamps(place.id, lamp?.asset ?? 'street lamp', pl, group, out, free) });
    }
    props.forEach((prop, j) => {
      if (group?.lampSpots.length && LAMP.test(prop.asset)) return; // already at the crossings
      if (group?.streets.length && (group.kerbs || LAMP.test(prop.asset))) { alongStreets(recipe.seed, place.id, prop, j, group, field, out, free); return; }
      const inner = place.kind === 'settlement' ? 4 : pl.radius + 1.5;
      const outer = place.kind === 'settlement' ? pl.radius + 6 : pl.radius + 10;
      for (let k = 0; k < prop.count && out.length < MAX_EXTRAS; k++) {
        const rng = mulberry32(hashString(`${recipe.seed}:${place.id}:prop:${j}:${k}`));
        for (let t = 0; t < TRIES; t++) {
          const a = rng() * Math.PI * 2, d = inner + rng() * (outer - inner);
          const x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
          if (field.slopeAt(x, z) > 0.5 || field.isReserved(x, z, ROAD_GAP[prop.size]) || !free(x, z)) continue;
          out.push({ id: `${place.id}-prop-${j}-${k}`, placeId: place.id, asset: prop.asset, size: prop.size, x, y: field.heightAt(x, z), z, rotation: Math.atan2(pl.x - x, pl.z - z) });
          break;
        }
      }
    });
  }
  for (const l of lamps.sort((a, b) => b.size - a.size)) l.add();
  return out;

  function streetLamps(placeId: string, asset: string, pl: Placement, group: StreetGroup, into: Extra[], ok: (x: number, z: number) => boolean): void {
    const spots = [...group.lampSpots].sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z));
    let n = 0;
    for (const s of spots) {
      if (n >= MAX_LAMPS || lampsSoFar >= MAX_WORLD_LAMPS) break;
      if (!ok(s.x, s.z) || field.isOnRoad(s.x, s.z, KERB_GAP) || !clearOfBuildings(group.buildings, s.x, s.z)) continue;
      into.push({ id: `${placeId}-lamp-${n}`, placeId, asset, size: 'large', x: s.x, y: field.heightAt(s.x, s.z), z: s.z, rotation: s.rotation });
      n++;
      lampsSoFar++;
    }
  }
}

/** Twice the asked count (a street is long), each on a random kerb of a random street, facing across it. */
function alongStreets(seed: number, placeId: string, prop: PlaceProp, j: number, group: StreetGroup, field: WorldField, out: Extra[],
  free: (x: number, z: number) => boolean): void {
  const parked = VEHICLE.test(prop.asset), lamp = LAMP.test(prop.asset);
  for (let k = 0; k < prop.count * 2 && out.length < MAX_EXTRAS; k++) {
    const rng = mulberry32(hashString(`${seed}:${placeId}:kerb:${j}:${k}`));
    for (let t = 0; t < TRIES; t++) {
      const road = group.streets[Math.floor(rng() * group.streets.length)];
      if (road.points.length < 2) continue;
      const i = Math.floor(rng() * (road.points.length - 1));
      const a = road.points[i], b = road.points[i + 1], f = rng();
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len, side = rng() < 0.5 ? -1 : 1;
      const off = road.width / 2 + (parked ? -PARK_IN : KERB_OUT);
      const x = a.x + (b.x - a.x) * f + nx * side * off, z = a.z + (b.z - a.z) * f + nz * side * off;
      if (!free(x, z) || !clearOfBuildings(group.buildings, x, z)) continue;
      if (lamp && out.some((e) => e.placeId === placeId && LAMP.test(e.asset) && Math.hypot(e.x - x, e.z - z) < LAMP_SPACING)) continue;
      // Never in a crossing or on another street: a kerb prop is off every road, a parked vehicle off every other one.
      if (parked ? field.roads.some((r) => r !== road && roadGap(r, x, z) < PARKED_GAP) : field.isOnRoad(x, z, KERB_GAP)) continue;
      // Parked cars line up with the street; everything else faces it.
      const rotation = parked ? Math.atan2(b.x - a.x, b.z - a.z) + (side < 0 ? Math.PI : 0) : Math.atan2(-nx * side, -nz * side);
      out.push({ id: `${placeId}-prop-${j}-${k}`, placeId, asset: prop.asset, size: prop.size, x, y: field.heightAt(x, z), z, rotation });
      break;
    }
  }
}
