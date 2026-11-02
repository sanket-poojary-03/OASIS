import { afterEach, describe, expect, it, vi } from 'vitest';
import { editWorld, generateWorld, resolveAsset } from '../../src/api/client';
import { loadRecipeFixture } from '../fixtures';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const ctx = { player: { x: 0, z: 0 }, lookAt: null, lookingAt: null, placements: [] };

afterEach(() => vi.unstubAllGlobals());

describe('client fallbacks', () => {
  it('falls back to the offline world on 429 and on an invalid recipe', async () => {
    vi.stubGlobal('fetch', reply(429, { detail: 'slow down' }));
    expect((await generateWorld('a desert')).source).toBe('offline');
    vi.stubGlobal('fetch', reply(200, { type: 'recipe', recipe: { nope: 1 }, notes: [], source: 'live' }));
    expect((await generateWorld('a desert')).source).toBe('offline');
  });

  it('falls back to the local edit on network error or bad ops', async () => {
    const r = loadRecipeFixture('fishing-valley');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await editWorld(r, 'make it night', ctx)).source).toBe('offline');
    vi.stubGlobal('fetch', reply(200, { type: 'ops', ops: [{ op: 'bogus' }], notes: [], source: 'live' }));
    expect((await editWorld(r, 'make it night', ctx)).source).toBe('offline');
  });

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
    expect(await resolveAsset('dragon', 'prop', false)).toEqual({ status: 'none', transient: true });
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
