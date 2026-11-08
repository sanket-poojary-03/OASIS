/** Device tier: low-tier devices (narrow screen or <= 4 cores) get a smaller view radius and shadow map. */
export interface TierInputs { narrow: boolean; cores: number | undefined }

export function isLowTier({ narrow, cores }: TierInputs): boolean {
  return narrow || (cores !== undefined && cores <= 4);
}

/** Reads the real environment; safe outside a browser (reports "not low" there). */
export function detectLowTier(): boolean {
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  return isLowTier({ narrow, cores });
}

export const LOW_TIER = detectLowTier();
export const VIEW_RADIUS = LOW_TIER ? 2 : 3;
export const SHADOW_MAP_SIZE = LOW_TIER ? 1024 : 2048;

/** Land builders running at once: all but two of the cores (the page and the GPU's driver need theirs), and at most four. */
export function chunkWorkers(cores: number | undefined): number {
  return Math.max(1, Math.min(4, (cores ?? 4) - 2));
}
export const CHUNK_WORKERS = chunkWorkers(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);
