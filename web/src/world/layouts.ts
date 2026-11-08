import type { Interaction, Layout, Place, PlaceSize } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Crop, Paved, Road, WorldField } from './field';
import type { Placement } from './placement';
import { CLIFF } from './roads';
import { siteIsDry, type Building } from './settlement';
import { towerFacade } from './towerSpec';
import { isClearOfWater } from './waterDepth';

/**
 * Group layouts other than the village street: a city grid, a ring around a centre piece, a line along one street,
 * or a loose scatter. Members can be any repeated thing (towers, tents, stalls, domes, trees); the model finder fetches it.
 */

/** No group spreads wider than this (the core world is 1024 m across). */
export const MAX_GROUP_RADIUS = 200;
const DEFAULT_COUNT: Record<Layout['pattern'], Record<PlaceSize, number>> = {
  village: { small: 6, medium: 12, large: 20 },
  grid: { small: 16, medium: 30, large: 48 },
  ring: { small: 6, medium: 10, large: 16 },
  line: { small: 8, medium: 14, large: 20 },
  scatter: { small: 8, medium: 16, large: 30 },
};
/** Grid: a plot of up to 14 m in a 30 m cell, leaving an 8 m street with a 4 m pavement either side. */
const CELL = 30;
const PLOT = 14;
const STREET_WIDTH = 8;
/** This share of a grid's cells stays open (a yard, a small park), so a city is not a solid block of towers. */
const OPEN_LOTS = 0.15;
/** How far either side of its lot's middle a park reaches, leaving a pavement around it. */
const PARK_HALF = CELL / 2 - STREET_WIDTH / 2 - 2;
const RING_GAP = 18;
const LINE_STEP = 18;
const LINE_LATERAL = 11;
const SCATTER_GAP = 15;
/** Widest member beside a street or in a scatter: wider ones would reach the street. */
const MEMBER_MAX_WIDTH = 12;
/** A group's main street keeps this far from a member's centre, and stops this far from a centre piece. */
const STREET_CLEARANCE = 9;
const CENTRE_CLEARANCE = 7;
const MEMBER_FOOTPRINT = 8;
const LOW_HEIGHT: Record<PlaceSize, number> = { small: 5, medium: 6, large: 7 };
const STREET_SAMPLE = 8;
/** How finely a street's way is tested for a sheer drop: the lip of a pad at a canyon's edge is only a few metres wide. */
const STREET_CHECK = 2;

/** Where a street lamp can stand: a kerb corner of a grid crossing, facing the crossing. */
export interface Spot { x: number; z: number; rotation: number }
/** Lamps stand this far from the crossing's centre along both streets (just off the asphalt). */
const KERB = STREET_WIDTH / 2 + 0.8;

export interface GroupLayout { buildings: Building[]; spine: Road; streets: Road[]; paved?: Paved; lampSpots: Spot[]; crops?: Crop[] }

/** A member's asset: the place's own, or (with layout.variants) a deterministic mix, so a city is not one tower repeated. */
export function memberAsset(place: Place, seed: number): (index: number) => string {
  const all = [place.asset, ...(place.layout?.variants ?? [])];
  if (all.length === 1) return () => place.asset;
  return (i) => all[Math.floor(mulberry32(seed ^ hashString(`${place.id}:member:${i}`))() * all.length)];
}

/** Cells per side of a grid: room for its members, its plaza and its open lots. */
const gridSide = (count: number): number => Math.ceil(Math.sqrt((count + 1) / (1 - OPEN_LOTS)));

export const groupCount = (layout: Layout, size: PlaceSize): number => layout.count ?? DEFAULT_COUNT[layout.pattern][size];

/** The radius a group needs to hold its members (the placement solver takes the larger of this and the size radius). */
export function groupRadius(layout: Layout, size: PlaceSize): number {
  const n = groupCount(layout, size);
  switch (layout.pattern) {
    case 'grid': return (gridSide(n) * CELL / 2) * Math.SQRT2 + 6;
    case 'ring': return Math.max(24, (n * RING_GAP) / (2 * Math.PI) + 14);
    case 'line': return (Math.ceil(n / 2) * LINE_STEP) / 2 + 12;
    case 'scatter': return Math.sqrt(n) * SCATTER_GAP * 1.1 + 10;
    case 'village': return n <= 20 ? 0 : Math.sqrt(n) * 16;
  }
}

/** What a group with no layout of its own is built like. */
export const DEFAULT_LOW: Pick<Layout, 'height'> = { height: 'low' };

/** Members' heights: "low" keeps the size's house height; "mixed" varies; "tall" peaks at the centre (`t` 0) and falls to the edge (1). */
export function heightFor(layout: Pick<Layout, 'height'>, size: PlaceSize, rng: () => number, t: number): number {
  const base = LOW_HEIGHT[size];
  if (layout.height === 'low') return base * (0.9 + rng() * 0.2);
  if (layout.height === 'mixed') return base * (0.8 + rng() * 1.6);
  // Towers are designed in code (towerSpec), not stretched models, so a downtown can rise to about 70 m.
  return (58 + (12 - 58) * Math.min(1, Math.max(0, t))) * (0.75 + rng() * 0.5);
}

const BUILDING_LIKE = /house|home|cottage|hut|cabin|shack|lodge|apartment|flat|office|shop|store|market|building|block|tower|hall|inn|tavern|cafe|café|bakery|barn|shed|church|chapel|temple|school|station|tent|yurt|dome|hangar|warehouse|factory|garage|villa|mansion/i;
/** Words for an open space, not an object: a "glass plaza" centre found a barn. Such a centre becomes a fountain. */
const OPEN_SPACE = /\b(plaza|square|piazza|courtyard|park|garden|green|commons?|forum|place|area|space|ground)s?\b/i;
export const centrePiece = (asset: string | undefined): string | undefined =>
  asset === undefined ? undefined : OPEN_SPACE.test(asset) && !/fountain|statue|monument|obelisk|clock|tower|well|pavilion|gazebo|bandstand/i.test(asset) ? 'fountain' : asset;

/** The interaction a centre piece offers, from its name. */
export function centreInteraction(asset: string): Interaction {
  if (/fire|brazier|bonfire/i.test(asset)) return 'fire';
  if (/bell|gong/i.test(asset)) return 'sound';
  if (/lamp|lantern|torch|beacon/i.test(asset)) return 'light';
  if (/bench|seat|chair/i.test(asset)) return 'sit';
  return 'none';
}

/** Urban buildings: streets between them are asphalt, and a grid of them is a city block (paving, street lamps). */
const URBAN = /\b(shops?|stores?|caf[eé]s?|restaurants?|malls?|banks?|garages?|warehouses?|factor(?:y|ies)|townhouses?|offices?|apartments?|flats|hotels?|stations?|modern|urban|city|downtown|suburban)\b/i;

/**
 * A group of city buildings. A grid of anything else (coral garden beds, market stalls, tents) is not a city: before,
 * any grid paved its square, lit its crossings and turned every road in the world to asphalt.
 */
export const isUrban = (place: Place): boolean =>
  [place.asset, ...(place.layout?.variants ?? [])].some((a) => URBAN.test(a) || towerFacade(a, true, place.layout?.pattern === 'grid') !== null);

/** Whether the straight way from a to b goes over a sheer drop, too steep for any road. */
function sheerBetween(field: WorldField, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / STREET_CHECK));
  let before = field.heightAt(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const here = field.heightAt(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n);
    if (Math.abs(here - before) > (len / n) * CLIFF) return true;
    before = here;
  }
  return false;
}

/** A straight street sampled every few metres and split where it would cross water or go over a cliff; asphalt when `paved`. */
function street(field: WorldField, ax: number, az: number, bx: number, bz: number, paved = false): Road[] {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / STREET_SAMPLE));
  const out: Road[] = [];
  let run: Array<{ x: number; z: number }> = [];
  const flush = () => { if (run.length >= 2) out.push({ points: run, width: STREET_WIDTH, bridges: run.slice(1).map(() => false), paved }); run = []; };
  for (let i = 0; i <= steps; i++) {
    const x = ax + ((bx - ax) * i) / steps, z = az + ((bz - az) * i) / steps;
    if (!isClearOfWater(field, x, z, STREET_WIDTH / 2 + 0.5)) { flush(); continue; }
    if (run.length > 0 && sheerBetween(field, run[run.length - 1], { x, z })) flush();
    run.push({ x, z });
  }
  flush();
  return out;
}

/** Boats and the like float: a dockyard's boats stood on the grass. Wrecks and hulls may lie anywhere; air and space ships do not float. */
const WATERCRAFT = /\b(boats?|rowboats?|sailboats?|ships?|yachts?|rafts?|canoes?|kayaks?|ferr(?:y|ies)|skiffs?|trawlers?|dinghy|dinghies|gondolas?|catamarans?|barges?)\b/i;
const NOT_AFLOAT = /wreck|hull|sunken|stranded|beached|ruin|graveyard|rusted|space|\bair|star/i;
export const isWatercraft = (asset: string): boolean => WATERCRAFT.test(asset) && !NOT_AFLOAT.test(asset);
/** How far a floating thing sits below the surface. */
const AFLOAT_SINK = 0.2;

/** The nearest open water to (x, z), at most `reach` away, with clear water around it; null on dry land. */
function waterSpot(field: WorldField, x: number, z: number, reach: number): { x: number; z: number } | null {
  for (let d = 0; d <= reach; d += 6) {
    for (let k = 0; k < (d === 0 ? 1 : 8); k++) {
      const a = (k / 8) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (field.isWater(px, pz) && field.isWater(px + 4, pz) && field.isWater(px - 4, pz) && field.isWater(px, pz + 4) && field.isWater(px, pz - 4)) return { x: px, z: pz };
    }
  }
  return null;
}

export function layoutGroup(place: Place, layout: Layout, pl: Placement, field: WorldField, seed: number): GroupLayout {
  const rng = mulberry32(seed ^ hashString(`${place.id}:${layout.pattern}`));
  const count = groupCount(layout, place.size);
  const angle = rng() * Math.PI;
  const dir = { x: Math.cos(angle), z: Math.sin(angle) };
  const side = { x: -dir.z, z: dir.x };
  const at = (along: number, lateral: number) => ({ x: pl.x + dir.x * along + side.x * lateral, z: pl.z + dir.z * along + side.z * lateral });
  const inRadius = (x: number, z: number) => Math.hypot(x - pl.x, z - pl.z) <= pl.radius;
  const memberInteraction: Interaction = place.interaction !== 'none' ? place.interaction : BUILDING_LIKE.test(place.asset) ? 'door' : 'none';
  const buildings: Building[] = [];
  const streets: Road[] = [];
  const lampSpots: Spot[] = [];
  const assetOf = memberAsset(place, seed);
  const city = isUrban(place);
  let paved: Paved | undefined;

  const centreAsset = centrePiece(layout.centre) ?? (layout.pattern === 'grid' ? 'fountain' : undefined);
  if (centreAsset) {
    buildings.push({
      id: `${place.id}-centre`, placeId: place.id, x: pl.x, z: pl.z, y: field.heightAt(pl.x, pl.z), rotation: angle,
      kind: 'centre', asset: centreAsset, footprint: 3, interaction: centreInteraction(centreAsset),
    });
  }
  const members = () => buildings.filter((b) => b.kind === 'house').length;
  // Every group but a grid gets one main street through its middle, so paths and the player can reach it. It is laid
  // out first: members keep off it, and it stops short of a centre piece. A ring's only comes in from one side, between two members.
  const reach = layout.pattern === 'line' ? (Math.ceil(count / 2) * LINE_STEP) / 2 + 6 : pl.radius * 0.9;
  const mainStretches: Array<[number, number]> = layout.pattern === 'grid' ? []
    : layout.pattern === 'ring' ? [[centreAsset ? CENTRE_CLEARANCE : 0, reach]]
      : centreAsset ? [[-reach, -CENTRE_CLEARANCE], [CENTRE_CLEARANCE, reach]] : [[-reach, reach]];
  const onMainStreet = (x: number, z: number): boolean => {
    const along = (x - pl.x) * dir.x + (z - pl.z) * dir.z, lateral = (x - pl.x) * side.x + (z - pl.z) * side.z;
    return mainStretches.some(([from, to]) => Math.hypot(along - Math.max(from, Math.min(to, along)), lateral) < STREET_CLEARANCE);
  };
  // In an ocean a loose scatter has no deck: all of it floats (kelp, rafts, buoys).
  const allAfloat = field.deckY !== null && layout.pattern === 'scatter';
  const add = (ax: number, az: number, rotation: number, gap: number, maxWidth: number): boolean => {
    if (members() >= count || !inRadius(ax, az)) return false;
    const n = members();
    const asset = assetOf(n);
    const water = allAfloat || isWatercraft(asset) ? waterSpot(field, ax, az, pl.radius * 1.8 + 30) : null; // past the land its pad flattens, up to 1.8 x its radius
    if (!water && (allAfloat || !siteIsDry(field, ax, az, MEMBER_FOOTPRINT))) return false;
    const { x, z } = water ?? { x: ax, z: az };
    if (!water && onMainStreet(x, z)) return false;
    if (buildings.some((b) => Math.hypot(b.x - x, b.z - z) < (b.kind === 'centre' ? gap * 0.8 : gap))) return false;
    const t = Math.hypot(x - pl.x, z - pl.z) / (pl.radius * 0.8);
    buildings.push({
      id: `${place.id}-house-${n}`, placeId: place.id, x, z, y: water ? (field.waterSurfaceAt(x, z) ?? field.heightAt(x, z)) - AFLOAT_SINK : field.heightAt(x, z), rotation, kind: 'house',
      asset, footprint: MEMBER_FOOTPRINT, interaction: memberInteraction,
      height: heightFor(layout, place.size, rng, t), maxWidth,
    });
    return true;
  };
  const facing = (s: number) => Math.atan2(-side.x * s, -side.z * s);

  let spine: Road;
  switch (layout.pattern) {
    case 'grid': {
      const n = gridSide(count);
      const offs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * CELL);
      const cells = offs.flatMap((a) => offs.map((l) => ({ a, l })));
      cells.sort((p, q) => Math.hypot(p.a, p.l) - Math.hypot(q.a, q.l) || p.a - q.a || p.l - q.l);
      const isOpen = (c: { a: number; l: number }) => mulberry32(seed ^ hashString(`${place.id}:lot:${c.a}:${c.l}`))() < OPEN_LOTS;
      // The open lots fill last, and only if the rest of the grid could not hold every member (water, steep ground).
      const lots: Array<{ u: number; v: number }> = [];
      for (const c of [...cells.filter((q) => !isOpen(q)), ...cells.filter(isOpen)]) {
        if (centreAsset && Math.hypot(c.a, c.l) < CELL / 2) continue; // the plaza
        const p = at(c.a, c.l);
        if (!add(p.x, p.z, facing(c.l >= 0 ? 1 : -1), CELL * 0.75, PLOT)) lots.push({ u: c.a, v: c.l });
      }
      const ext = (n * CELL) / 2;
      for (let k = 0; k <= n; k++) {
        const o = -ext + k * CELL;
        const a1 = at(-ext, o), a2 = at(ext, o), b1 = at(o, -ext), b2 = at(o, ext);
        streets.push(...street(field, a1.x, a1.z, a2.x, a2.z, city), ...street(field, b1.x, b1.z, b2.x, b2.z, city));
      }
      // City ground is paved, its empty lots are parks, and every crossing gets a lamp on one kerb corner (alternating, so streets are lit evenly).
      if (city) paved = { x: pl.x, z: pl.z, half: ext + STREET_WIDTH / 2, angle, parks: lots, parkHalf: PARK_HALF };
      if (city) for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const sa = (i + j) % 2 ? 1 : -1, sl = i % 2 ? 1 : -1;
        const p = at(-ext + i * CELL + sa * KERB, -ext + j * CELL + sl * KERB);
        if (field.isWater(p.x, p.z)) continue;
        lampSpots.push({ ...p, rotation: Math.atan2(-sa * dir.x - sl * side.x, -sa * dir.z - sl * side.z) });
      }
      break;
    }
    case 'ring': {
      const r = Math.max(10, (count * RING_GAP) / (2 * Math.PI));
      for (let i = 0; i < count; i++) {
        const th = angle + ((i + 0.5) / count) * Math.PI * 2; // half a step round, so the main street comes in between two
        const x = pl.x + Math.cos(th) * r, z = pl.z + Math.sin(th) * r;
        add(x, z, Math.atan2(pl.x - x, pl.z - z), Math.min(RING_GAP, (2 * Math.PI * r) / count) * 0.8, Math.min(MEMBER_MAX_WIDTH, (2 * Math.PI * r) / count * 0.6));
      }
      break;
    }
    case 'line': {
      const half = (Math.ceil(count / 2) * LINE_STEP) / 2;
      for (let along = -half + LINE_STEP / 2; along <= half; along += LINE_STEP) {
        for (const s of [-1, 1]) {
          const p = at(along, s * LINE_LATERAL);
          add(p.x, p.z, facing(s), LINE_STEP * 0.8, MEMBER_MAX_WIDTH);
        }
      }
      break;
    }
    case 'scatter':
    case 'village': {
      for (let tries = 0; tries < count * 40 && members() < count; tries++) {
        const th = rng() * Math.PI * 2, d = Math.sqrt(rng()) * pl.radius * 0.9;
        add(pl.x + Math.cos(th) * d, pl.z + Math.sin(th) * d, rng() * Math.PI * 2, SCATTER_GAP, MEMBER_MAX_WIDTH);
      }
      break;
    }
  }
  if (layout.pattern === 'grid') {
    // The longest grid street is the main one (paths join it); the rest stay streets.
    streets.sort((p, q) => q.points.length - p.points.length);
    spine = streets.shift() ?? { points: [{ x: pl.x, z: pl.z }, { x: pl.x + dir.x, z: pl.z + dir.z }], width: 4, bridges: [false] };
  } else {
    const main = mainStretches.flatMap(([from, to]) => {
      const s1 = at(from, 0), s2 = at(to, 0);
      return street(field, s1.x, s1.z, s2.x, s2.z, city);
    }).sort((p, q) => q.points.length - p.points.length);
    spine = main.shift() ?? { points: [{ x: pl.x, z: pl.z }, { x: pl.x + dir.x, z: pl.z + dir.z }], width: 4, bridges: [false] };
    streets.push(...main);
  }
  return { buildings, spine, streets, paved, lampSpots };
}
