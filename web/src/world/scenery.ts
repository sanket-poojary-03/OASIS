import { CORE_HALF, type Interaction, type PlaceSize, type Recipe, type SceneryEntry, type ScenerySpot } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { WorldField } from './field';
import { footprint, type Placement } from './placement';
import { LAMP, VEHICLE } from './props';

/** One thing found out in the open, between the named places. */
export interface SceneryItem {
  id: string;
  asset: string;
  kind: SceneryEntry['kind'];
  size: PlaceSize;
  interaction: Interaction;
  x: number;
  y: number;
  z: number;
  rotation: number;
  /** Why it stands here: the same "why here" as a named place. */
  reasons: string[];
}

/** Each cell of this size holds at most one find: at a walk, the next one is under half a minute away. */
export const SCENERY_CELL = 128;
const SITES = 20;
/** Finds keep this far from a named place's edge, so they read as out in the open and not as part of it. */
const PLACE_MARGIN = 18;
const ROAD_MARGIN = 3;
const SPAWN_MARGIN = 14;
const CELL_INSET = 10;
/** Buildings stand on a flattened pad, so they take steeper ground than a prop lying on it. */
const MAX_SLOPE: Record<SceneryEntry['kind'], number> = { landmark: 0.5, structure: 0.42, prop: 0.5 };
/** A "water" thing stands within this of the shore. */
const SHORE = 30;
/** A landmark that comes up in a cell keeps it this often, so the world has a few, not a dozen copies of one. */
const LANDMARK_KEEP = 0.5;
const COMPANION_MAX = 2;

/** What the AI named for the open land; failing that, the small things it gave its places (lamps and vehicles stay in town). */
export function sceneryKinds(recipe: Recipe): SceneryEntry[] {
  if (recipe.scenery?.length) return recipe.scenery;
  const out = new Map<string, SceneryEntry>();
  for (const place of recipe.places) {
    for (const p of place.props ?? []) {
      if (!LAMP.test(p.asset) && !VEHICLE.test(p.asset)) out.set(p.asset, { asset: p.asset, kind: 'prop', size: p.size, interaction: 'none', spot: 'anywhere' });
    }
  }
  return [...out.values()];
}

interface Site { x: number; z: number; h: number; shore: number }

/**
 * Fills the land the named places leave empty: one find per cell, on free, gentle, dry ground. The AI says what; code
 * says where. A cell decides from its own hash alone, with the kinds in a repeating pattern across the grid, so
 * neighbours differ and an edit changes only the cells next to it: nothing else in the world moves.
 */
export function scatterScenery(recipe: Recipe, placements: Placement[], field: WorldField, spawn: { x: number; z: number }): SceneryItem[] {
  const kinds = sceneryKinds(recipe);
  if (kinds.length === 0) return [];
  const ocean = field.deckY !== null;
  const small = kinds.filter((k) => k.kind === 'prop' && k.spot === 'anywhere');
  const n = Math.round((CORE_HALF * 2) / SCENERY_CELL);
  const out: SceneryItem[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (ocean && (i + j) % 2) continue; // every find is a deck to draw, and open sea should stay open
    const rng = mulberry32(hashString(`${recipe.seed}:scenery:${i}:${j}`));
    const clearOf = (x: number, z: number, r: number) =>
      Math.hypot(x - spawn.x, z - spawn.z) > r + SPAWN_MARGIN && placements.every((p) => Math.hypot(p.x - x, p.z - z) > p.radius + r + PLACE_MARGIN) && !field.isReserved(x, z, r + ROAD_MARGIN);
    const minX = -CORE_HALF + i * SCENERY_CELL + CELL_INSET, minZ = -CORE_HALF + j * SCENERY_CELL + CELL_INSET, span = SCENERY_CELL - CELL_INSET * 2;
    const spots = Array.from({ length: SITES }, () => ({ x: minX + rng() * span, z: minZ + rng() * span }));
    const keepsLandmark = rng() < LANDMARK_KEEP, rotation = rng() * Math.PI * 2, variant = Math.floor(rng() * 3);
    const start = i + j * 5 + (recipe.seed % kinds.length);
    let lead: { kind: SceneryEntry; site: Site } | null = null;
    // A building that does not fit gives way to another building before a prop, or props crowd out everything else.
    const turn = kinds.map((_, k) => kinds[(start + k) % kinds.length]);
    const order = turn[0].kind === 'prop' ? turn : [...turn.filter((k) => k.kind !== 'prop'), ...turn.filter((k) => k.kind === 'prop')];
    for (const kind of order) {
      if (lead) break;
      if (kind.kind === 'landmark' && !keepsLandmark) continue;
      const site = chooseSite(spots, kind, field, clearOf, ocean);
      if (site) lead = { kind, site };
    }
    if (!lead) continue;
    const { kind, site } = lead;
    const r = footprint(kind.kind, kind.size);
    if (ocean || kind.kind !== 'prop') field.addPad({ x: site.x, z: site.z, radius: Math.max(r, 4), y: field.deckY ?? site.h });
    const id = `wild-${i}-${j}`;
    const y = field.deckY ?? field.heightAt(site.x, site.z);
    out.push({ id: `${id}-${variant}`, asset: kind.asset, kind: kind.kind, size: kind.size, interaction: kind.interaction, x: site.x, y, z: site.z, rotation, reasons: reasonsFor(kind.spot, site, placements, recipe) });
    if (ocean) continue;
    // A small thing or two beside it, so a find reads as somewhere someone has been.
    const others = small.filter((s) => s.asset !== kind.asset);
    const count = others.length ? Math.floor(rng() * (COMPANION_MAX + 1)) : 0;
    for (let c = 0; c < count; c++) {
      const other = others[Math.floor(rng() * others.length)];
      for (let t = 0; t < 8; t++) {
        const a = rng() * Math.PI * 2, d = r + 2 + rng() * 6;
        const x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d;
        if (field.isWater(x, z) || field.slopeAt(x, z) > MAX_SLOPE.prop || !clearOf(x, z, 1)) continue;
        out.push({ id: `${id}-c${c}-${variant}`, asset: other.asset, kind: 'prop', size: other.size, interaction: other.interaction, x, y: field.heightAt(x, z), z, rotation: rng() * Math.PI * 2, reasons: [`beside the ${kind.asset}`] });
        break;
      }
    }
  }
  return out;
}

function chooseSite(spots: Array<{ x: number; z: number }>, kind: SceneryEntry, field: WorldField, clearOf: (x: number, z: number, r: number) => boolean, ocean: boolean): Site | null {
  const r = footprint(kind.kind, kind.size);
  let best: Site | null = null;
  for (const { x, z } of spots) {
    if (!clearOf(x, z, r)) continue;
    if (!ocean && (field.isWater(x, z) || isRough(field, x, z, r, MAX_SLOPE[kind.kind]))) continue;
    const site: Site = { x, z, h: field.heightAt(x, z), shore: ocean ? 0 : field.waterDistance(x, z) };
    if (kind.spot === 'water' && !ocean && site.shore > SHORE + r) continue;
    if (!best || better(kind.spot, site, best)) best = site;
    if (kind.spot === 'anywhere' || ocean) break;
  }
  return best;
}

const better = (spot: ScenerySpot, a: Site, b: Site): boolean => (spot === 'high' ? a.h > b.h : spot === 'water' ? a.shore < b.shore : false);

function isRough(field: WorldField, x: number, z: number, r: number, maxSlope: number): boolean {
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (field.isWater(x + dx, z + dz) || field.slopeAt(x + dx, z + dz) > maxSlope) return true;
  }
  return false;
}

function reasonsFor(spot: ScenerySpot, site: Site, placements: Placement[], recipe: Recipe): string[] {
  const reasons = [spot === 'high' ? `high ground (${site.h.toFixed(0)} m)` : spot === 'water' ? `${site.shore.toFixed(0)} m from water` : 'open, gentle ground'];
  const near = placements.reduce<Placement | null>((best, p) => (!best || Math.hypot(p.x - site.x, p.z - site.z) < Math.hypot(best.x - site.x, best.z - site.z) ? p : best), null);
  if (near) reasons.push(`${Math.hypot(near.x - site.x, near.z - site.z).toFixed(0)} m from ${recipe.places.find((p) => p.id === near.id)?.label ?? near.id}`);
  return reasons;
}
