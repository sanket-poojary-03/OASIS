import type { Recipe } from '../core/recipe';
import { runChecks, type Check } from './checks';
import { createField, type Road, type WorldField } from './field';
import { findSpawn, solvePlacements, type Placement } from './placement';
import { findPath } from './roads';
import { layoutSettlement, type Building } from './settlement';

export interface BuiltWorld {
  recipe: Recipe;
  field: WorldField;
  placements: Placement[];
  buildings: Building[];
  roads: Road[];
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
  for (const place of recipe.places) {
    if (place.kind !== 'settlement') continue;
    const pl = placements.find((p) => p.id === place.id);
    if (!pl) continue;
    const { buildings: b, spine } = layoutSettlement(place, pl, field, recipe.seed);
    field.addRoad(spine);
    roads.push(spine);
    buildings.push(...b);
    log.push(`Laid out ${b.length} buildings in ${place.label}`);
  }
  for (const path of recipe.paths) {
    const a = placements.find((p) => p.id === path.from), b = placements.find((p) => p.id === path.to);
    if (!a || !b) continue;
    const road = findPath(field, a, b);
    if (road) {
      field.addRoad(road);
      roads.push(road);
      log.push(`Built a road from ${path.from} to ${path.to}${road.bridges.some(Boolean) ? ' (with a bridge)' : ''}`);
    }
  }
  const spawn = findSpawn(field, placements);
  const checks = runChecks(field, placements, spawn);
  return { recipe, field, placements, buildings, roads, spawn, checks, log };
}
