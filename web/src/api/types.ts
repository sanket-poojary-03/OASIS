import type { Op } from '../core/ops';
import type { Recipe } from '../core/recipe';

export type Source = 'live' | 'mock' | 'cache' | 'offline';
export type WorldResult = { type: 'recipe'; recipe: Recipe; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source };
export type EditResult = { type: 'ops'; ops: Op[]; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source };
/** Mirrors backend `EditContext` (strict: no other keys). The app omits lookAt/lookingAt when absent; null stays accepted for older callers. */
export interface EditContext {
  player: { x: number; z: number };
  lookAt?: { x: number; z: number; y?: number } | null;
  lookingAt?: string | null;
  placements: Array<{ id: string; label: string; x: number; z: number }>;
}
/**
 * `none` means "use the procedural placeholder". `transient` marks a none that only says the backend could not be
 * reached or answer now (network, timeout, 429, 5xx); without it the backend definitively has no model (HTTP-200 none).
 * `credit` is third-party text: textContent only.
 */
export interface AssetResult { status: 'ready' | 'pending' | 'none'; source?: 'library' | 'online' | 'generated'; url?: string; jobId?: string; credit?: string; transient?: true }
