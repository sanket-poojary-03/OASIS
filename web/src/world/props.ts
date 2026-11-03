import type { PlaceSize, Recipe } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { WorldField } from './field';
import type { Placement } from './placement';

/** A small thing scattered around its place (barrels by the market, benches in the plaza): the recipe's place.props. */
export interface Extra { id: string; placeId: string; asset: string; size: PlaceSize; x: number; y: number; z: number; rotation: number }

/** The most props one world scatters (each is a model, a draw call or few, and a collider). */
export const MAX_EXTRAS = 120;
/** Props keep this far apart, and this far from the place's own centre. */
const SPACING = 2.5;
const TRIES = 14;

/**
 * Deterministic positions for every place's props: on dry, gentle, free ground (never on a road, a building plot or
 * another prop) in a ring around the place, facing it. The AI only says what and how many; code decides where.
 */
export function scatterProps(recipe: Recipe, placements: Placement[], field: WorldField): Extra[] {
  const out: Extra[] = [];
  for (const place of recipe.places) {
    const pl = placements.find((p) => p.id === place.id);
    if (!pl || !place.props?.length) continue;
    const inner = place.kind === 'settlement' ? 4 : pl.radius + 1.5;
    const outer = place.kind === 'settlement' ? pl.radius + 6 : pl.radius + 10;
    place.props.forEach((prop, j) => {
      for (let k = 0; k < prop.count && out.length < MAX_EXTRAS; k++) {
        const rng = mulberry32(hashString(`${recipe.seed}:${place.id}:prop:${j}:${k}`));
        for (let t = 0; t < TRIES; t++) {
          const a = rng() * Math.PI * 2, d = inner + rng() * (outer - inner);
          const x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
          if (field.isWater(x, z) || field.slopeAt(x, z) > 0.5 || field.isReserved(x, z, 1.2)) continue;
          if (out.some((e) => Math.hypot(e.x - x, e.z - z) < SPACING)) continue;
          out.push({ id: `${place.id}-prop-${j}-${k}`, placeId: place.id, asset: prop.asset, size: prop.size, x, y: field.heightAt(x, z), z, rotation: Math.atan2(pl.x - x, pl.z - z) });
          break;
        }
      }
    });
  }
  return out;
}
