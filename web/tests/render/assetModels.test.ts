import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetResult } from '../../src/api/types';
import { AssetModelSource, BREAKER_MS, MISS_TTL_MS, TRANSIENT_TTL_MS } from '../../src/render/assetModels';

const READY: AssetResult = { status: 'ready', source: 'library', url: 'http://x/a.glb' };
const NONE: AssetResult = { status: 'none' };
const DOWN: AssetResult = { status: 'none', transient: true };

/** An AssetModelSource with a fake clock, fake resolve/job endpoints and a fake GLB loader. */
function rig(answer: (query: string) => AssetResult | Promise<AssetResult>) {
  const clock = { t: 1_000_000 };
  const resolve = vi.fn(async (query: string) => answer(query));
  const job = vi.fn(async (): Promise<AssetResult> => READY);
  const loadGltf = vi.fn(async () => ({ scene: new THREE.Group() }));
  const src = new AssetModelSource(() => false, { resolve, job, loadGltf, now: () => clock.t, sleep: async () => {} });
  return { src, clock, resolve, job, loadGltf };
}

describe('AssetModelSource caching', () => {
  it('dedupes in-flight requests and keeps successes forever', async () => {
    const { src, clock, resolve } = rig(() => READY);
    const [a, b] = await Promise.all([src.load('barrel', 'prop'), src.load('Barrel ', 'prop')]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    clock.t += MISS_TTL_MS * 10;
    expect(await src.load('barrel', 'prop')).toBe(a);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('(b) a definitive none is not asked again for ~10 minutes', async () => {
    const { src, clock, resolve } = rig(() => NONE);
    expect(await src.load('giraffe', 'prop')).toBeNull();
    expect(await src.load('giraffe', 'prop')).toBeNull();
    clock.t += MISS_TTL_MS - 1;
    expect(await src.load('giraffe', 'prop')).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
    clock.t += 2;
    await src.load('giraffe', 'prop');
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(MISS_TTL_MS).toBe(10 * 60_000);
  });

  it('(b) a GLB that fails to load is retried after the short TTL, without opening the breaker', async () => {
    const { src, clock, resolve, loadGltf } = rig(() => READY);
    loadGltf.mockRejectedValueOnce(new Error('bad glb'));
    expect(await src.load('well', 'prop')).toBeNull();
    expect(await src.load('fence', 'prop')).not.toBeNull(); // other assets still load: no breaker
    expect(await src.load('well', 'prop')).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(2);
    clock.t += TRANSIENT_TTL_MS + 1;
    expect(await src.load('well', 'prop')).not.toBeNull();
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(TRANSIENT_TTL_MS).toBeGreaterThanOrEqual(30_000);
    expect(TRANSIENT_TTL_MS).toBeLessThanOrEqual(60_000);
  });

  it('(c) a transport failure opens a source-wide breaker: no requests at all while it is open', async () => {
    const { src, clock, resolve } = rig(() => DOWN);
    expect(await src.load('house', 'structure')).toBeNull();
    for (const q of ['tower', 'lantern', 'bench', 'house']) expect(await src.load(q, 'prop')).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1); // an offline edit costs zero requests
    clock.t += BREAKER_MS + 1;
    expect(await src.load('tower', 'prop')).toBeNull(); // window over: one new request (still down)
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(await src.load('bench', 'prop')).toBeNull(); // and the breaker re-opened
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('(c) after the breaker window only one probe goes out; when it succeeds the rest load again', async () => {
    let up = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const { src, clock, resolve } = rig(async () => { if (!up) return DOWN; await gate; return READY; });
    await src.load('house', 'structure');
    clock.t += BREAKER_MS + 1;
    up = true;
    const probe = src.load('tower', 'landmark');
    expect(await src.load('bench', 'prop')).toBeNull(); // probe still in flight: no second request
    expect(resolve).toHaveBeenCalledTimes(2);
    release();
    expect(await probe).not.toBeNull();
    expect(await src.load('bench', 'prop')).not.toBeNull();
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('(d) reset() forgets misses and closes the breaker', async () => {
    let mode: 'none' | 'down' | 'up' = 'none';
    const { src, resolve } = rig(() => (mode === 'none' ? NONE : mode === 'down' ? DOWN : READY));
    await src.load('giraffe', 'prop');
    mode = 'down';
    await src.load('house', 'structure');
    expect(await src.load('giraffe', 'prop')).toBeNull();
    expect(await src.load('tower', 'prop')).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(2);
    src.reset();
    mode = 'up';
    expect(await src.load('giraffe', 'prop')).not.toBeNull();
    expect(await src.load('house', 'structure')).not.toBeNull();
    expect(resolve).toHaveBeenCalledTimes(4);
  });

  it('polls a pending job; flaky polls are tolerated, a definitive job none is a long miss', async () => {
    const { src, job, resolve } = rig(() => ({ status: 'pending', jobId: 'j1' }));
    job.mockResolvedValueOnce(DOWN).mockResolvedValueOnce({ status: 'pending', jobId: 'j1' }).mockResolvedValueOnce(READY);
    expect(await src.load('dragon statue', 'landmark')).not.toBeNull();
    expect(job).toHaveBeenCalledTimes(3);
    job.mockReset();
    job.mockResolvedValue(NONE);
    expect(await src.load('kraken', 'landmark')).toBeNull();
    expect(job).toHaveBeenCalledTimes(1);
    expect(await src.load('kraken', 'landmark')).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
