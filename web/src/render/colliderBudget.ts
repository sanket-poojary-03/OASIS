/** Trimesh colliders cost a BVH build on the main thread; cap how many are built per frame. */
export const COLLIDER_BUDGET = 2;

export interface ColliderCandidate { key: string; dist: number }

/** Nearest-first (the player's own chunk has dist 0), at most `budget` keys; ties keep input order. */
export function pickColliderBuilds(candidates: ColliderCandidate[], budget = COLLIDER_BUDGET): string[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.dist - b.c.dist || a.i - b.i)
    .slice(0, Math.max(0, budget))
    .map(({ c }) => c.key);
}
