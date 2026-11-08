import type { PlaceKind } from '../core/recipe';
import TABLE from './bundledModels.json';
import type { AssetResult } from './types';

/**
 * Models that ship with the site (public/models/bundled), by what they are asked for as: the start screen's world and
 * the base art. They need no server, so the first thing anyone sees never waits for a sleeping backend, and asking for
 * them again in a world of your own is instant. Written by scripts/bundle_models.mjs; only ever the 3D models, which the
 * rules allow to be kept: every world is still the AI's.
 */
const table: Record<string, { url: string; source: 'library' | 'online'; credit?: string }> = TABLE as never;

export const bundledKey = (query: string, kind: PlaceKind, variant: number): string => `${kind}:${query.toLowerCase().trim()}#${variant}`;

export function bundledAsset(query: string, kind: PlaceKind, variant: number): AssetResult | null {
  const hit = table[bundledKey(query, kind, variant)];
  return hit ? { status: 'ready', ...hit } : null;
}
