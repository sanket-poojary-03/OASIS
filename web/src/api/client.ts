import { opsSchema } from '../core/ops';
import { parseRecipe, type PlaceKind, type Recipe } from '../core/recipe';
import { localEdit, localWorld } from './localMock';
import type { AssetResult, EditContext, EditResult, Source, WorldResult } from './types';

export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000').replace(/\/$/, '');

const SOURCES: readonly Source[] = ['live', 'mock', 'cache', 'offline'];
/** Unknown sources are labelled 'mock' (never claim 'live' for something unverified). */
const asSource = (v: unknown): Source => (SOURCES.includes(v as Source) ? (v as Source) : 'mock');
/** Clamp to the backend request models (WorldRequest 3..600, EditRequest 2..400, AssetRequest query <=120) so oversized input is not a silent 422. */
const clip = (s: string, max: number): string => s.slice(0, max);
const asNotes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : []);

/** A non-2xx answer; `detail` is the backend's FastAPI message when it sent one. Network errors and timeouts throw the fetch error instead. */
class HttpError extends Error {
  constructor(readonly status: number, path: string, readonly detail?: string) { super(`${path} -> ${status}`); }
}

/** The backend answered 200 but with something that does not validate here. */
class BadAnswer extends Error {}

/** AI only: when the backend is reachable but the AI cannot answer, the player sees why and the world stays as it is. */
export const AI_BUSY = 'The AI is busy right now. Please try again in a moment.';
export const AI_BAD_ANSWER = 'The AI gave an answer that could not be used. Please try again.';
/** Offline mode is only for a backend that cannot be reached at all (fetch itself failed); everything else is an AI error. */
const unreachable = (e: unknown): boolean => e instanceof TypeError;
const aiError = (e: unknown): { type: 'unsupported'; reason: string; source: Source } => ({
  type: 'unsupported',
  reason: e instanceof HttpError ? (e.detail ?? AI_BUSY).slice(0, 300) : e instanceof BadAnswer ? AI_BAD_ANSWER : AI_BUSY,
  source: 'live',
});

/** Throws on network error, timeout, any non-2xx (incl. 429/5xx; an HttpError) or non-JSON body. */
async function post(path: string, body: unknown, timeoutMs = 45000): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => null);
    const detail = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).detail : undefined;
    throw new HttpError(r.status, path, typeof detail === 'string' ? detail : undefined);
  }
  const data: unknown = await r.json();
  if (typeof data !== 'object' || data === null) throw new Error(`${path}: bad response`);
  return data as Record<string, unknown>;
}

export async function health(): Promise<{ ok: boolean; provider: string } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d: unknown = await r.json();
    if (typeof d !== 'object' || d === null) return null;
    const { ok, provider } = d as Record<string, unknown>;
    return typeof ok === 'boolean' && typeof provider === 'string' ? { ok, provider } : null;
  } catch {
    return null;
  }
}

export async function generateWorld(prompt: string): Promise<WorldResult> {
  if (prompt.trim().length < 3) return { type: 'unsupported', reason: 'Describe your world in a few more words.', source: 'live' };
  try {
    const data = await post('/api/world', { prompt: clip(prompt, 600) }, 90000);
    if (data.type === 'unsupported') return { type: 'unsupported', reason: String(data.reason), source: asSource(data.source) };
    const parsed = parseRecipe(data.recipe);
    if (!parsed.ok) throw new BadAnswer(parsed.error);
    return { type: 'recipe', recipe: parsed.recipe, notes: asNotes(data.notes), source: asSource(data.source) };
  } catch (e) {
    if (!unreachable(e)) { console.warn('generateWorld: AI unavailable:', e); return aiError(e); }
    console.warn('generateWorld: backend unreachable, offline mode:', e);
    return localWorld(prompt);
  }
}

export async function editWorld(recipe: Recipe, prompt: string, ctx: EditContext): Promise<EditResult> {
  if (prompt.trim().length < 2) return { type: 'unsupported', reason: 'Type a change, like "make it night".', source: 'live' };
  try {
    const data = await post('/api/edit', { recipe, prompt: clip(prompt, 400), context: ctx }, 90000);
    if (data.type === 'unsupported') return { type: 'unsupported', reason: String(data.reason), source: asSource(data.source) };
    const ops = opsSchema.safeParse(data.ops);
    if (!ops.success) throw new BadAnswer(ops.error.message);
    return { type: 'ops', ops: ops.data, notes: asNotes(data.notes), source: asSource(data.source) };
  } catch (e) {
    if (!unreachable(e)) { console.warn('editWorld: AI unavailable:', e); return aiError(e); }
    console.warn('editWorld: backend unreachable, offline mode:', e);
    return localEdit(recipe, prompt, ctx);
  }
}

const NONE: AssetResult = { status: 'none' };
/** The backend could not be reached or could not answer now (network, 429, 5xx, unreadable body). */
const DOWN: AssetResult = { status: 'none', transient: true };
/** The request timed out: transient for this lookup only (a slow online search or download), not "the backend is down". */
const SLOW: AssetResult = { status: 'none', transient: true, timeout: true };
const isTimeout = (e: unknown): boolean => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
/** Only a definitive client error (a 4xx other than 429) is a real "no model"; every other failure is transient. */
const failed = (e: unknown): AssetResult => (isTimeout(e) ? SLOW : e instanceof HttpError && e.status < 500 && e.status !== 429 ? NONE : DOWN);
const absolute = (url: string): string => (url.startsWith('/') ? `${API_BASE}${url}` : url);

/** Validate an asset response; anything malformed becomes `none` (placeholder). Credit is third-party text: render with textContent only. */
function toAsset(data: unknown): AssetResult {
  if (typeof data !== 'object' || data === null) return NONE;
  const d = data as Record<string, unknown>;
  if (d.status === 'ready' && typeof d.url === 'string' && d.url) {
    const source = d.source === 'library' || d.source === 'online' || d.source === 'generated' ? d.source : undefined;
    return { status: 'ready', source, url: absolute(d.url), credit: typeof d.credit === 'string' ? d.credit.slice(0, 300) : undefined };
  }
  if (d.status === 'pending' && typeof d.jobId === 'string' && d.jobId) return { status: 'pending', jobId: d.jobId };
  return NONE;
}

/** The backend AssetRequest accepts variant 0..99. */
export const MAX_VARIANT = 99;
export const clampVariant = (v: number): number => Math.max(0, Math.min(MAX_VARIANT, Math.floor(v) || 0));

/**
 * `allowOnline = false` keeps the lookup to the CC0 library and the model cache (the base art must be instant and
 * consistent). `variant` rotates between equally good library models, so the houses of a village differ.
 */
export async function resolveAsset(query: string, kind: PlaceKind, allowGenerate: boolean, allowOnline = true, variant = 0): Promise<AssetResult> {
  try {
    const body = { query: clip(query, 120), kind, allowGenerate, allowOnline, variant: clampVariant(variant) };
    return toAsset(await post('/api/assets/resolve', body, 20000));
  } catch (e) {
    return failed(e);
  }
}

export async function assetJob(id: string): Promise<AssetResult> {
  try {
    const r = await fetch(`${API_BASE}/api/assets/jobs/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new HttpError(r.status, '/api/assets/jobs');
    return toAsset(await r.json());
  } catch (e) {
    return failed(e);
  }
}
