import { pyRound } from '../core/pyround';
import { clampCore, type Recipe } from '../core/recipe';
import type { EditContext } from './types';

/** What the crosshair hit: a point on terrain or on an object (`placeId` set when the object belongs to a place). */
export interface LookHit { x: number; y: number; z: number; placeId?: string | null }

export interface EditContextInput {
  player: { x: number; z: number };
  recipe: Recipe;
  placements: ReadonlyArray<{ id: string; x: number; z: number }>;
  /** A fixed point to treat as "here" (director mode): lookAt without y, no lookingAt. Wins over `hit`. */
  override?: { x: number; z: number };
  hit?: LookHit | null;
}

/**
 * The /api/edit context. The backend model is strict (extra keys give a 422, which the client silently turns into
 * offline mode), so only player, lookAt, lookingAt and placements {id,label,x,z} are sent, and absent values are
 * omitted rather than sent as null. lookAt is clamped to the core map; y is present only for a real surface hit.
 */
export function makeEditContext({ player, recipe, placements, override, hit }: EditContextInput): EditContext {
  const ctx: EditContext = {
    player: { x: player.x, z: player.z },
    placements: placements.map((p) => ({
      id: p.id, label: recipe.places.find((q) => q.id === p.id)?.label ?? p.id, x: Math.round(p.x), z: Math.round(p.z),
    })),
  };
  if (override) {
    ctx.lookAt = { x: clampCore(override.x), z: clampCore(override.z) };
  } else if (hit) {
    ctx.lookAt = { x: clampCore(hit.x), z: clampCore(hit.z), y: pyRound(hit.y, 2) };
    if (hit.placeId) ctx.lookingAt = hit.placeId;
  }
  return ctx;
}
