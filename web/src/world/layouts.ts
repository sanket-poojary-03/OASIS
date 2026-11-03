import type { Interaction, Layout, Place, PlaceSize } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Paved, Road, WorldField } from './field';
import type { Placement } from './placement';
import { siteIsDry, type Building } from './settlement';

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
/** Grid: an 11 m plot plus a 7 m street per cell. */
const CELL = 18;
const PLOT = 11;
const STREET_WIDTH = 6;
const RING_GAP = 12;
const LINE_STEP = 12;
const LINE_LATERAL = 9;
const SCATTER_GAP = 9;
const MEMBER_FOOTPRINT = 8;
const LOW_HEIGHT: Record<PlaceSize, number> = { small: 5, medium: 6, large: 7 };
const STREET_SAMPLE = 8;

/** Where a street lamp can stand: a kerb corner of a grid crossing, facing the crossing. */
export interface Spot { x: number; z: number; rotation: number }
/** Lamps stand this far from the crossing's centre along both streets (just off the asphalt). */
const KERB = STREET_WIDTH / 2 + 0.8;

export interface GroupLayout { buildings: Building[]; spine: Road; streets: Road[]; paved?: Paved; lampSpots: Spot[] }

/** A member's asset: the place's own, or (with layout.variants) a deterministic mix, so a city is not one tower repeated. */
export function memberAsset(place: Place, seed: number): (index: number) => string {
  const all = [place.asset, ...(place.layout?.variants ?? [])];
  if (all.length === 1) return () => place.asset;
  return (i) => all[Math.floor(mulberry32(seed ^ hashString(`${place.id}:member:${i}`))() * all.length)];
}

export const groupCount = (layout: Layout, size: PlaceSize): number => layout.count ?? DEFAULT_COUNT[layout.pattern][size];

/** The radius a group needs to hold its members (the placement solver takes the larger of this and the size radius). */
export function groupRadius(layout: Layout, size: PlaceSize): number {
  const n = groupCount(layout, size);
  switch (layout.pattern) {
    case 'grid': return (Math.ceil(Math.sqrt(n + 1)) * CELL / 2) * Math.SQRT2 + 6;
    case 'ring': return Math.max(24, (n * RING_GAP) / (2 * Math.PI) + 14);
    case 'line': return (Math.ceil(n / 2) * LINE_STEP) / 2 + 12;
    case 'scatter': return Math.sqrt(n) * SCATTER_GAP * 1.1 + 10;
    case 'village': return n <= 20 ? 0 : Math.sqrt(n) * 16;
  }
}

/** Members' heights: "low" keeps the size's house height; "mixed" varies; "tall" peaks at the centre (`t` 0) and falls to the edge (1). */
function heightFor(layout: Layout, size: PlaceSize, rng: () => number, t: number): number {
  const base = LOW_HEIGHT[size];
  if (layout.height === 'low') return base * (0.9 + rng() * 0.2);
  if (layout.height === 'mixed') return base * (0.8 + rng() * 1.6);
  return (42 + (11 - 42) * Math.min(1, Math.max(0, t))) * (0.75 + rng() * 0.5);
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

/** A straight street sampled every few metres and split where it would cross water. */
function street(field: WorldField, ax: number, az: number, bx: number, bz: number): Road[] {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / STREET_SAMPLE));
  const out: Road[] = [];
  let run: Array<{ x: number; z: number }> = [];
  const flush = () => { if (run.length >= 2) out.push({ points: run, width: STREET_WIDTH, bridges: run.slice(1).map(() => false), paved: true }); run = []; };
  for (let i = 0; i <= steps; i++) {
    const x = ax + ((bx - ax) * i) / steps, z = az + ((bz - az) * i) / steps;
    if (field.isWater(x, z)) flush(); else run.push({ x, z });
  }
  flush();
  return out;
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
  let paved: Paved | undefined;

  const centreAsset = centrePiece(layout.centre) ?? (layout.pattern === 'grid' ? 'fountain' : undefined);
  if (centreAsset) {
    buildings.push({
      id: `${place.id}-centre`, placeId: place.id, x: pl.x, z: pl.z, y: field.heightAt(pl.x, pl.z), rotation: angle,
      kind: 'centre', asset: centreAsset, footprint: 3, interaction: centreInteraction(centreAsset),
    });
  }
  const members = () => buildings.filter((b) => b.kind === 'house').length;
  const add = (x: number, z: number, rotation: number, gap: number, maxWidth: number): boolean => {
    if (members() >= count || !inRadius(x, z) || !siteIsDry(field, x, z, MEMBER_FOOTPRINT)) return false;
    if (buildings.some((b) => Math.hypot(b.x - x, b.z - z) < (b.kind === 'centre' ? gap * 0.8 : gap))) return false;
    const t = Math.hypot(x - pl.x, z - pl.z) / (pl.radius * 0.8);
    const n = members();
    buildings.push({
      id: `${place.id}-house-${n}`, placeId: place.id, x, z, y: field.heightAt(x, z), rotation, kind: 'house',
      asset: assetOf(n), footprint: MEMBER_FOOTPRINT, interaction: memberInteraction,
      height: heightFor(layout, place.size, rng, t), maxWidth,
    });
    return true;
  };
  const facing = (s: number) => Math.atan2(-side.x * s, -side.z * s);

  let spine: Road;
  switch (layout.pattern) {
    case 'grid': {
      const n = Math.ceil(Math.sqrt(count + (centreAsset ? 1 : 0)));
      const offs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * CELL);
      const cells = offs.flatMap((a) => offs.map((l) => ({ a, l })));
      cells.sort((p, q) => Math.hypot(p.a, p.l) - Math.hypot(q.a, q.l) || p.a - q.a || p.l - q.l);
      for (const c of cells) {
        if (centreAsset && Math.hypot(c.a, c.l) < CELL / 2) continue; // the plaza
        const p = at(c.a, c.l);
        add(p.x, p.z, facing(c.l >= 0 ? 1 : -1), CELL * 0.75, PLOT);
      }
      const ext = (n * CELL) / 2;
      for (let k = 0; k <= n; k++) {
        const o = -ext + k * CELL;
        const a1 = at(-ext, o), a2 = at(ext, o), b1 = at(o, -ext), b2 = at(o, ext);
        streets.push(...street(field, a1.x, a1.z, a2.x, a2.z), ...street(field, b1.x, b1.z, b2.x, b2.z));
      }
      // City ground is paved, and every crossing gets a lamp on one kerb corner (alternating, so streets are lit evenly).
      paved = { x: pl.x, z: pl.z, half: ext + STREET_WIDTH / 2, angle };
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
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
        const th = angle + (i / count) * Math.PI * 2;
        const x = pl.x + Math.cos(th) * r, z = pl.z + Math.sin(th) * r;
        add(x, z, Math.atan2(pl.x - x, pl.z - z), Math.min(RING_GAP, (2 * Math.PI * r) / count) * 0.8, Math.min(10, (2 * Math.PI * r) / count * 0.85));
      }
      break;
    }
    case 'line': {
      const half = (Math.ceil(count / 2) * LINE_STEP) / 2;
      for (let along = -half + LINE_STEP / 2; along <= half; along += LINE_STEP) {
        for (const s of [-1, 1]) {
          const p = at(along, s * LINE_LATERAL);
          add(p.x, p.z, facing(s), LINE_STEP * 0.8, LINE_STEP * 0.85);
        }
      }
      break;
    }
    case 'scatter':
    case 'village': {
      for (let tries = 0; tries < count * 40 && members() < count; tries++) {
        const th = rng() * Math.PI * 2, d = Math.sqrt(rng()) * pl.radius * 0.9;
        add(pl.x + Math.cos(th) * d, pl.z + Math.sin(th) * d, rng() * Math.PI * 2, SCATTER_GAP, SCATTER_GAP * 0.9);
      }
      break;
    }
  }
  if (layout.pattern === 'grid') {
    // The longest grid street is the main one (paths join it); the rest stay streets.
    streets.sort((p, q) => q.points.length - p.points.length);
    spine = streets.shift() ?? { points: [{ x: pl.x, z: pl.z }, { x: pl.x + dir.x, z: pl.z + dir.z }], width: 4, bridges: [false] };
  } else {
    // Every other group gets one main street through its middle, so paths and the player can reach it.
    const reach = layout.pattern === 'line' ? (Math.ceil(count / 2) * LINE_STEP) / 2 + 6 : pl.radius * 0.9;
    const s1 = at(-reach, 0), s2 = at(reach, 0);
    const main = street(field, s1.x, s1.z, s2.x, s2.z).sort((p, q) => q.points.length - p.points.length);
    spine = main.shift() ?? { points: [{ x: pl.x, z: pl.z }, { x: pl.x + dir.x, z: pl.z + dir.z }], width: 4, bridges: [false] };
    streets.push(...main);
  }
  return { buildings, spine, streets, paved, lampSpots };
}
