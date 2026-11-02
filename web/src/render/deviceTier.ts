/** Device tier: low-tier devices (narrow screen or <= 4 cores) get a smaller view radius and shadow map. */
export interface TierInputs { narrow: boolean; cores: number | undefined }

export function isLowTier({ narrow, cores }: TierInputs): boolean {
  return narrow || (cores !== undefined && cores <= 4);
}

/** Reads the real environment; safe outside a browser (vitest/node reports "not low", so values stay deterministic). */
export function detectLowTier(): boolean {
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  return isLowTier({ narrow, cores });
}

export const LOW_TIER = detectLowTier();
export const VIEW_RADIUS = LOW_TIER ? 2 : 3;
export const SHADOW_MAP_SIZE = LOW_TIER ? 1024 : 2048;
