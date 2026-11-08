import { afterEach, describe, expect, it, vi } from 'vitest';
import { briefWorld, editWorld, generateWorld, resolveAsset } from '../../src/api/client';
import { loadRecipeFixture } from '../fixtures';

const ctx = { player: { x: 0, z: 0 }, lookAt: null, lookingAt: null, placements: [] };

function storage(key: string | null) {
  const data = new Map<string, string>(key ? [['oasis.llmKey', key]] : []);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** Every request's x-llm-key header (null when absent). */
function recordHeaders(): (string | null)[] {
  const seen: (string | null)[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    seen.push(new Headers(init.headers).get('x-llm-key'));
    return new Response(JSON.stringify({ detail: 'busy' }), { status: 503 });
  }));
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

describe('bring your own key: the requests', () => {
  it('a saved key goes with every AI request', async () => {
    vi.stubGlobal('localStorage', storage('sk_player_key_123'));
    const seen = recordHeaders();
    await briefWorld('a harbour');
    await generateWorld('a harbour');
    await editWorld(loadRecipeFixture('fishing-valley'), 'make it night', ctx);
    await resolveAsset('lighthouse', 'landmark', false);
    expect(seen).toEqual(Array(4).fill('sk_player_key_123'));
  });

  it('without a saved key no header is sent (the server key is used)', async () => {
    vi.stubGlobal('localStorage', storage(null));
    const seen = recordHeaders();
    await generateWorld('a harbour');
    expect(seen).toEqual([null]);
  });

  it('a rejected key is told to the player in the server words', async () => {
    vi.stubGlobal('localStorage', storage('sk_player_key_123'));
    const detail = 'Your API key was rejected. Check it on the start screen, or remove it to use the free AI.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail }), { status: 401 })));
    expect(await generateWorld('a harbour')).toMatchObject({ type: 'unsupported', reason: detail });
  });
});
