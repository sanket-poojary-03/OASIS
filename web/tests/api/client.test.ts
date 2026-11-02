import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_BUSY, AI_BAD_ANSWER, editWorld, generateWorld, resolveAsset } from '../../src/api/client';
import { loadRecipeFixture } from '../fixtures';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const ctx = { player: { x: 0, z: 0 }, lookAt: null, lookingAt: null, placements: [] };

afterEach(() => vi.unstubAllGlobals());

describe('AI only: a reachable backend never gets swapped for the offline mock', () => {
  it('429 / 503 / 500 from /api/world or /api/edit become an "AI busy" message, never a keyword world', async () => {
    const r = loadRecipeFixture('fishing-valley');
    for (const status of [429, 500, 503]) {
      vi.stubGlobal('fetch', reply(status, { detail: 'The AI is busy right now. Please try again in a moment.' }));
      expect(await generateWorld('a desert')).toEqual({ type: 'unsupported', reason: 'The AI is busy right now. Please try again in a moment.', source: 'live' });
      expect(await editWorld(r, 'make it night', ctx)).toMatchObject({ type: 'unsupported', source: 'live' });
    }
  });

  it('a non-text or missing detail uses the default busy wording', async () => {
    vi.stubGlobal('fetch', reply(503, {}));
    expect(await generateWorld('a desert')).toMatchObject({ type: 'unsupported', reason: AI_BUSY });
  });

  it('an invalid recipe or ops from the backend is an error message, not a fallback', async () => {
    const r = loadRecipeFixture('fishing-valley');
    vi.stubGlobal('fetch', reply(200, { type: 'recipe', recipe: { nope: 1 }, notes: [], source: 'live' }));
    expect(await generateWorld('a desert')).toMatchObject({ type: 'unsupported', reason: AI_BAD_ANSWER });
    vi.stubGlobal('fetch', reply(200, { type: 'ops', ops: [{ op: 'bogus' }], notes: [], source: 'live' }));
    expect(await editWorld(r, 'make it night', ctx)).toMatchObject({ type: 'unsupported', reason: AI_BAD_ANSWER });
  });

  it('a timeout is "AI busy" (the backend is up but slow), not offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); }));
    expect(await generateWorld('a desert')).toMatchObject({ type: 'unsupported', reason: AI_BUSY });
  });

  it('only an unreachable backend uses offline mode, labelled offline', async () => {
    const r = loadRecipeFixture('fishing-valley');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await generateWorld('a desert')).toMatchObject({ type: 'recipe', source: 'offline' });
    expect(await editWorld(r, 'make it night', ctx)).toMatchObject({ type: 'ops', source: 'offline' });
  });
});

describe('asset fallbacks', () => {
  it('treats none and failures as placeholder, and absolutises library urls', async () => {
    vi.stubGlobal('fetch', reply(200, { status: 'none' }));
    expect((await resolveAsset('dragon', 'prop', false)).status).toBe('none');
    vi.stubGlobal('fetch', reply(500, {}));
    expect((await resolveAsset('dragon', 'prop', false)).status).toBe('none');
    vi.stubGlobal('fetch', reply(200, { status: 'ready', source: 'online', url: '/assets/x.glb', credit: 'by <b>x</b> CC-BY' }));
    const ok = await resolveAsset('chair', 'prop', false);
    expect(ok.status === 'ready' && ok.url).toMatch(/^http.*\/assets\/x\.glb$/);
  });
});

describe('asset request parameters', () => {
  it('sends allowOnline and a clamped integer variant (backend AssetRequest: 0..99)', async () => {
    const f = reply(200, { status: 'none' });
    vi.stubGlobal('fetch', f);
    await resolveAsset('pine tree', 'prop', false, false);
    await resolveAsset('house', 'structure', false, true, 3);
    await resolveAsset('house', 'structure', false, true, 250);
    await resolveAsset('house', 'structure', false, true, -2.5);
    const bodies = f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body) as Record<string, unknown>);
    expect(bodies[0]).toEqual({ query: 'pine tree', kind: 'prop', allowGenerate: false, allowOnline: false, variant: 0 });
    expect(bodies.slice(1).map((b) => [b.allowOnline, b.variant])).toEqual([[true, 3], [true, 99], [true, 0]]);
  });
});

describe('client hardening', () => {
  it('health validates its response; unknown source is not live; long input is clipped', async () => {
    const { health } = await import('../../src/api/client');
    vi.stubGlobal('fetch', reply(200, { weird: 1 }));
    expect(await health()).toBeNull();
    vi.stubGlobal('fetch', reply(200, { ok: true, provider: 'mock' }));
    expect(await health()).toEqual({ ok: true, provider: 'mock' });
    const r = loadRecipeFixture('fishing-valley');
    vi.stubGlobal('fetch', reply(200, { type: 'unsupported', reason: 'x', source: 'weird' }));
    expect((await editWorld(r, 'make it night', ctx)).source).toBe('mock');
    const f = reply(200, { type: 'unsupported', reason: 'x', source: 'live' });
    vi.stubGlobal('fetch', f);
    await generateWorld('x'.repeat(900));
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { prompt: string };
    expect(sent.prompt).toHaveLength(600);
  });
});

describe('asset transport vs definitive none', () => {
  it('network error, timeout, 429 and 5xx are transient; HTTP-200 none and other 4xx are definitive', async () => {
    const { assetJob } = await import('../../src/api/client');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await resolveAsset('dragon', 'prop', false)).toEqual({ status: 'none', transient: true });
    expect(await assetJob('j1')).toEqual({ status: 'none', transient: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); }));
    expect(await resolveAsset('dragon', 'prop', false)).toEqual({ status: 'none', transient: true, timeout: true }); // m7
    expect(await assetJob('j1')).toEqual({ status: 'none', transient: true, timeout: true });
    for (const status of [429, 500, 502, 503]) {
      vi.stubGlobal('fetch', reply(status, {}));
      expect(await resolveAsset('dragon', 'prop', false)).toEqual({ status: 'none', transient: true });
      expect(await assetJob('j1')).toEqual({ status: 'none', transient: true });
    }
    vi.stubGlobal('fetch', reply(200, { status: 'none' }));
    expect(await resolveAsset('dragon', 'prop', false)).toEqual({ status: 'none' });
    expect(await assetJob('j1')).toEqual({ status: 'none' });
    vi.stubGlobal('fetch', reply(422, { detail: 'bad' }));
    expect(await resolveAsset('dragon', 'prop', false)).toEqual({ status: 'none' });
    vi.stubGlobal('fetch', reply(404, {}));
    expect(await assetJob('j1')).toEqual({ status: 'none' });
  });
});
