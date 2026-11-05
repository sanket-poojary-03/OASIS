import type { Op } from '../core/ops';
import type { Recipe } from '../core/recipe';
import type { Part } from './parts';

/** 'live': the LLM answered. 'none': it did not (the answer is a message, or a dev preset). */
export type Source = 'live' | 'none';
/** `notice`: a one-off message for the player about how this answer was made (e.g. the AI was rate-limited). textContent only. */
export interface Notice { notice?: string }
export type WorldResult = ({ type: 'recipe'; recipe: Recipe; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source }) & Notice;
export type EditResult = ({ type: 'ops'; ops: Op[]; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source }) & Notice;
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
 * `timeout` (with `transient`) marks a request that ran out of time: the backend is up but slow on this one lookup.
 * `credit` and `notices` are third-party or model-written text: textContent only.
 * A ready answer has `url` (a GLB) or `parts` (built in code, source 'procedural'). `tint`: the right model in the wrong colour.
 * `notices`: what the player should be told about how this model is being made.
 */
export interface AssetResult { status: 'ready' | 'pending' | 'none'; source?: 'library' | 'online' | 'generated' | 'procedural'; url?: string; parts?: Part[]; tint?: string; jobId?: string; credit?: string; notices?: string[]; transient?: true; timeout?: true }
