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
