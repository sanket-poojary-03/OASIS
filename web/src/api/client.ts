import { opsSchema } from '../core/ops';
import { parseRecipe, type PlaceKind, type Recipe } from '../core/recipe';
import { localEdit, localWorld } from './localMock';
import type { AssetResult, EditContext, EditResult, Source, WorldResult } from './types';

export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000').replace(/\/$/, '');

const SOURCES: readonly Source[] = ['live', 'mock', 'cache', 'offline'];
const asSource = (v: unknown): Source => (SOURCES.includes(v as Source) ? (v as Source) : 'live');
const asNotes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : []);

/** Throws on network error, timeout, any non-2xx (incl. 429/5xx) or non-JSON body. */
async function post(path: string, body: unknown, timeoutMs = 45000): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  const data: unknown = await r.json();
  if (typeof data !== 'object' || data === null) throw new Error(`${path}: bad response`);
  return data as Record<string, unknown>;
}

export async function health(): Promise<{ ok: boolean; provider: string } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(6000) });
    return r.ok ? ((await r.json()) as { ok: boolean; provider: string }) : null;
  } catch {
    return null;
  }
}

export async function generateWorld(prompt: string): Promise<WorldResult> {
  try {
    const data = await post('/api/world', { prompt });
    if (data.type === 'unsupported') return { type: 'unsupported', reason: String(data.reason), source: asSource(data.source) };
    const parsed = parseRecipe(data.recipe);
    if (!parsed.ok) throw new Error(parsed.error);
    return { type: 'recipe', recipe: parsed.recipe, notes: asNotes(data.notes), source: asSource(data.source) };
  } catch (e) {
    console.warn('generateWorld fell back to offline mode:', e);
    return localWorld(prompt);
  }
}

export async function editWorld(recipe: Recipe, prompt: string, ctx: EditContext): Promise<EditResult> {
  try {
    const data = await post('/api/edit', { recipe, prompt, context: ctx });
    if (data.type === 'unsupported') return { type: 'unsupported', reason: String(data.reason), source: asSource(data.source) };
    const ops = opsSchema.safeParse(data.ops);
    if (!ops.success) throw new Error(ops.error.message);
    return { type: 'ops', ops: ops.data, notes: asNotes(data.notes), source: asSource(data.source) };
  } catch (e) {
    console.warn('editWorld fell back to offline mode:', e);
    return localEdit(recipe, prompt, ctx);
  }
}

const NONE: AssetResult = { status: 'none' };
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

export async function resolveAsset(query: string, kind: PlaceKind, allowGenerate: boolean): Promise<AssetResult> {
  try {
    return toAsset(await post('/api/assets/resolve', { query, kind, allowGenerate }, 20000));
  } catch {
    return NONE;
  }
}

export async function assetJob(id: string): Promise<AssetResult> {
  try {
    const r = await fetch(`${API_BASE}/api/assets/jobs/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return NONE;
    return toAsset(await r.json());
  } catch {
    return NONE;
  }
}
