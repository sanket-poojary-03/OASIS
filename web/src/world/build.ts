import type { Recipe } from '../core/recipe';
import { runChecks, type Check } from './checks';
import { createField, type Road, type WorldField } from './field';
import { findSpawn, solvePlacements, type Placement } from './placement';
import { scatterProps, type Extra, type StreetGroup } from './props';
import { findPath, roadNetwork, type RoadNode } from './roads';
import { layoutSettlement, type Building } from './settlement';

/** The spawn point's id in the road network. */
const SPAWN = '__spawn';

export interface BuiltWorld {
  recipe: Recipe;
  field: WorldField;
  placements: Placement[];
  buildings: Building[];
  roads: Road[];
  /** Props scattered around places (place.props). */
  extras: Extra[];
  spawn: { x: number; y: number; z: number };
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
  for (const place of recipe.places) {
    if (place.kind !== 'settlement') continue;
    const pl = placements.find((p) => p.id === place.id);
    if (!pl) continue;
    const { buildings: b, spine, streets, paved, lampSpots } = layoutSettlement(place, pl, field, recipe.seed);
    for (const road of [spine, ...streets]) { field.addRoad(road); roads.push(road); }
    if (paved) field.addPaved(paved);
    // Grids and high streets put their props along the kerbs; villages, rings and scatters keep them around.
    const pattern = place.layout?.pattern;
    if (pattern === 'grid' || pattern === 'line') groups.set(place.id, { streets: [spine, ...streets], buildings: b, lampSpots });
    buildings.push(...b);
    log.push(`Laid out ${b.length} buildings in ${place.label}`);
  }
  // Roads everywhere: one connected network over every place (small props aside) and the spawn, so the player can
  // always follow a road to the next thing; the AI's own paths are added on top.
  const spawn = findSpawn(field, placements);
  // A world with a city grid gets asphalt roads between its places too; elsewhere they stay dirt tracks.
  const urban = recipe.places.some((p) => p.kind === 'settlement' && p.layout?.pattern === 'grid');
  const nodes: RoadNode[] = [{ id: SPAWN, x: spawn.x, z: spawn.z }];
  for (const p of placements) {
    if (recipe.places.find((q) => q.id === p.id)?.kind !== 'prop') nodes.push({ id: p.id, x: p.x, z: p.z });
  }
  const at = new Map(nodes.map((n) => [n.id, n]));
  const name = (id: string) => (id === SPAWN ? 'where you start' : recipe.places.find((q) => q.id === id)?.label ?? id);
  for (const [from, to] of roadNetwork(nodes, recipe.paths.map((p) => [p.from, p.to]))) {
    const a = at.get(from)!, b = at.get(to)!;
    if (Math.hypot(a.x - b.x, a.z - b.z) < 12) continue; // already next to each other
    const road = findPath(field, a, b);
    if (road) {
      if (urban) road.paved = true;
      field.addRoad(road);
      roads.push(road);
      log.push(`Built a road from ${name(from)} to ${name(to)}${road.bridges.some(Boolean) ? ' (with a bridge)' : ''}`);
    }
  }
  const checks = runChecks(field, placements, spawn);
  const extras = scatterProps(recipe, placements, field, groups); // after roads: never on one
  if (extras.length) log.push(`Scattered ${extras.length} details around the places`);
  return { recipe, field, placements, buildings, roads, extras, spawn, checks, log };
}
