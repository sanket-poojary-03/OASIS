import type { Recipe } from '../core/recipe';
import { runChecks, type Check } from './checks';
import { createField, type Road, type WorldField } from './field';
import { findSpawn, oceanSpawn, solvePlacements, type Placement } from './placement';
import { scatterProps, type Extra, type StreetGroup } from './props';
import { CLIFF, findRoad, roadNetwork, type RoadNode, type RoadObstacle } from './roads';
import type { Vec2 } from './river';
import { isUrban } from './layouts';
import { scatterScenery, type SceneryItem } from './scenery';
import { layoutSettlement, type Building } from './settlement';

/** The spawn point's id in the road network. */
const SPAWN = '__spawn';
/** How wide a berth a road gives a thing: past its edge, plus half the road and the 8 m search lattice's corner cutting. */
const ROAD_BERTH = 8;
const ROAD_STOPS_AT = 0.7;
/** What a road across water costs, in metres of road: a river is crossed once, not by every road near it. */
const CROSSING_PRICE = 600;
/** How finely the way between two places is tested for water: narrower than any river. */
const CROSSING_STEP = 16;
/** Half the width of the widest house a settlement builds, so a tree beside it stands clear of its corners. */
const PLOT_RADIUS = 5.5;

/** The nearest point of a place's own streets: a road into town joins them instead of cutting across its plots. */
function nearestOnStreets(streets: Road[], to: Vec2): Vec2 | null {
  let best: Vec2 | null = null, bestD = Infinity;
  for (const road of streets) for (let i = 0; i + 1 < road.points.length; i++) {
    const a = road.points[i], b = road.points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((to.x - a.x) * dx + (to.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const x = a.x + dx * t, z = a.z + dz * t, d = Math.hypot(x - to.x, z - to.z);
    if (d < bestD) { bestD = d; best = { x, z }; }
  }
  return best;
}

/** Whether the straight way from a to b meets water or a cliff: what the network crosses as seldom as it can. */
function crossesBarrier(field: WorldField, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(len / CROSSING_STEP);
  let before = field.heightAt(a.x, a.z);
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n, here = field.heightAt(x, z);
    if (field.isWater(x, z) || Math.abs(here - before) > (len / n) * CLIFF) return true;
    before = here;
  }
  return false;
}

/** A road to a landmark stops at the foot of the model (most of its radius out), not in the middle of it. */
function stopShortOf(road: Road, centres: Array<{ x: number; z: number; radius: number }>): void {
  const inside = (p: Vec2) => centres.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.radius * ROAD_STOPS_AT);
  let from = 0, to = road.points.length - 1;
  while (to - from > 1 && inside(road.points[from])) from++;
  while (to - from > 1 && inside(road.points[to])) to--;
  road.points = road.points.slice(from, to + 1);
  road.bridges = road.bridges.slice(from, to);
  if (road.high) road.high = road.high.slice(from, to);
}

export interface BuiltWorld {
  recipe: Recipe;
  field: WorldField;
  placements: Placement[];
  buildings: Building[];
  roads: Road[];
  /** Props scattered around places (place.props). */
  extras: Extra[];
  /** Finds out in the open, between the named places. */
  scenery: SceneryItem[];
  /** Where the player starts and, when known, the camera yaw that faces the main place. */
  spawn: { x: number; y: number; z: number; yaw?: number };
  checks: Check[];
  log: string[];
}

export function buildWorld(recipe: Recipe, keep: Placement[] = []): BuiltWorld {
  const log: string[] = [];
  const field = createField(recipe);
  log.push(`Shaped ${recipe.terrain.shape} terrain (${field.amplitude.toFixed(0)} m relief)`);
  if (field.river.length > 1) log.push(`Carved a river ${(field.river.length * 8).toFixed(0)} m long`);
  if (field.lakes.length) log.push(`Filled ${field.lakes.length === 1 ? 'a lake' : `${field.lakes.length} lakes`}`);

  const ids = new Set(recipe.places.map((p) => p.id));
  const placements = solvePlacements(recipe, field, keep.filter((p) => ids.has(p.id)));
  for (const p of placements) {
    const label = recipe.places.find((q) => q.id === p.id)?.label ?? p.id;
    log.push(`Placed ${label}: ${p.reasons.join(', ') || 'default spot'}`);
  }

  const buildings: Building[] = [];
  const roads: Road[] = [];
  const groups = new Map<string, StreetGroup>();
  const ownStreets = new Map<string, Road[]>();
  for (const place of recipe.places) {
    if (place.kind !== 'settlement') continue;
    const pl = placements.find((p) => p.id === place.id);
    if (!pl) continue;
    const { buildings: b, spine, streets, paved, lampSpots, crops } = layoutSettlement(place, pl, field, recipe.seed);
    for (const road of [spine, ...streets]) { field.addRoad(road); roads.push(road); }
    for (const c of crops ?? []) field.addCrop(c);
    ownStreets.set(place.id, [spine, ...streets]);
    if (paved) field.addPaved(paved);
    // On paving nothing grows anyway; on open ground a building's plot keeps trees and props away from its walls.
    else if (field.deckY === null) for (const m of b) field.addPlot({ x: m.x, z: m.z, radius: Math.max(PLOT_RADIUS, m.footprint / 2) });
    // Grids and high streets put their props along the kerbs; villages, rings and scatters keep them around, lamps aside.
    const pattern = place.layout?.pattern;
    const kerbs = pattern === 'grid' || pattern === 'line';
    if (kerbs || !pattern || pattern === 'village') groups.set(place.id, { streets: [spine, ...streets], buildings: b, lampSpots, kerbs });
    buildings.push(...b);
    log.push(`Laid out ${b.length} buildings in ${place.label}`);
  }
  // Roads everywhere: one connected network over every place (small props aside) and the spawn, so the player can
  // always follow a road to the next thing; the AI's own paths are added on top.
  const ocean = field.deckY !== null;
  const spawn = ocean ? oceanSpawn(field, placements) : findSpawn(field, placements);
  // A world with a city grid gets asphalt roads between its places too; elsewhere they stay dirt tracks.
  const cityIds = new Set(recipe.places.filter((p) => p.kind === 'settlement' && p.layout?.pattern === 'grid' && isUrban(p)).map((p) => p.id));
  const urban = cityIds.size > 0;
  // A world with a village as well keeps its country roads: only a road that reaches the city is asphalt.
  const countryside = recipe.places.some((p) => p.kind === 'settlement' && !cityIds.has(p.id));
  const nodes: RoadNode[] = [{ id: SPAWN, x: spawn.x, z: spawn.z }];
  for (const p of placements) {
    // In an ocean only decks can be walked to; a scatter floats on its own.
    if (recipe.places.find((q) => q.id === p.id)?.kind !== 'prop' && (!ocean || p.padded)) nodes.push({ id: p.id, x: p.x, z: p.z });
  }
  const at = new Map(nodes.map((n) => [n.id, n]));
  const avoid: RoadObstacle[] = ocean ? [] : [
    ...buildings.map((b) => ({ x: b.x, z: b.z, r: b.footprint / 2 + ROAD_BERTH })),
    ...placements.filter((p) => p.kind !== 'settlement').map((p) => ({ x: p.x, z: p.z, r: p.radius + ROAD_BERTH })),
  ];
  const standalone = (id: string) => placements.filter((p) => p.id === id && p.kind !== 'settlement');
  const name = (id: string) => (id === SPAWN ? 'where you start' : recipe.places.find((q) => q.id === id)?.label ?? id);
  const price = (a: RoadNode, b: RoadNode) => Math.hypot(a.x - b.x, a.z - b.z) + (!ocean && crossesBarrier(field, a, b) ? CROSSING_PRICE : 0);
  for (const [from, to] of roadNetwork(nodes, recipe.paths.map((p) => [p.from, p.to]), price)) {
    const na = at.get(from)!, nb = at.get(to)!;
    const a = ocean ? na : nearestOnStreets(ownStreets.get(from) ?? [], nb) ?? na;
    const b = ocean ? nb : nearestOnStreets(ownStreets.get(to) ?? [], a) ?? nb;
    if (Math.hypot(a.x - b.x, a.z - b.z) < 12) continue; // already next to each other
    const road = findRoad(field, a, b, avoid);
    if (!road) log.push(`No road from ${name(from)} to ${name(to)}: open water or cliffs between them`);
    if (road) {
      if (urban && !ocean && (!countryside || cityIds.has(from) || cityIds.has(to))) road.paved = true;
      if (!ocean) stopShortOf(road, [...standalone(from), ...standalone(to)]);
      field.addRoad(road);
      roads.push(road);
      log.push(`Built a road from ${name(from)} to ${name(to)}${road.bridges.some(Boolean) ? ' (with a bridge)' : ''}`);
    }
  }
  // The last word: no house stands on a road, whichever way the roads had to go.
  const kept = buildings.filter((b) => b.kind !== 'house' || !field.isOnRoad(b.x, b.z, b.footprint / 2));
  if (kept.length < buildings.length) log.push(`Left out ${buildings.length - kept.length} buildings that stood on a road`);
  const checks = runChecks(field, placements, spawn);
  const extras = scatterProps(recipe, placements, field, groups); // after roads: never on one
  if (extras.length) log.push(`Scattered ${extras.length} details around the places`);
  const scenery = scatterScenery(recipe, placements, field, spawn); // last: its pads must not move anything above
  if (scenery.length) log.push(`Left ${scenery.length} things to find out in the open`);
  return { recipe, field, placements, buildings: kept, roads, extras, scenery, spawn, checks, log };
}
