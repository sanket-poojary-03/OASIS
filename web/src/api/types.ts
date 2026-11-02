import type { Op } from '../core/ops';
import type { Recipe } from '../core/recipe';

export type Source = 'live' | 'mock' | 'cache' | 'offline';
export type WorldResult = { type: 'recipe'; recipe: Recipe; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source };
export type EditResult = { type: 'ops'; ops: Op[]; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source };
export interface EditContext {
  player: { x: number; z: number };
  lookAt: { x: number; z: number; y?: number } | null;
  lookingAt: string | null;
  placements: Array<{ id: string; label: string; x: number; z: number }>;
}
/** `none` means "use the procedural placeholder". `credit` is third-party text: textContent only. */
export interface AssetResult { status: 'ready' | 'pending' | 'none'; source?: 'library' | 'online' | 'generated'; url?: string; jobId?: string; credit?: string }
