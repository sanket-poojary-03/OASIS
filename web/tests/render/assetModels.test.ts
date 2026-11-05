import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetResult } from '../../src/api/types';
import { AssetModelSource, BREAKER_MS, MISS_TTL_MS, TRANSIENT_TTL_MS } from '../../src/render/assetModels';

const READY: AssetResult = { status: 'ready', source: 'library', url: 'http://x/a.glb' };
const NONE: AssetResult = { status: 'none' };
const DOWN: AssetResult = { status: 'none', transient: true };
const SLOW: AssetResult = { status: 'none', transient: true, timeout: true };

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

  it('(c) a timeout is a transient miss for that asset only: it never opens the breaker (m7)', async () => {
    const { src, clock, resolve } = rig((q) => (q === 'giraffe' ? SLOW : READY));
    expect(await src.load('giraffe', 'prop')).toBeNull();
    expect(await src.load('house', 'structure')).not.toBeNull(); // other assets still load
    expect(await src.load('giraffe', 'prop')).toBeNull(); // remembered for the short TTL
    expect(resolve).toHaveBeenCalledTimes(2);
    clock.t += TRANSIENT_TTL_MS + 1;
    await src.load('giraffe', 'prop');
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('(c) a timeout during the probe keeps the breaker as it was', async () => {
    let mode: 'down' | 'slow' | 'up' = 'down';
    const { src, clock, resolve } = rig(() => (mode === 'down' ? DOWN : mode === 'slow' ? SLOW : READY));
    await src.load('house', 'structure');
    clock.t += BREAKER_MS + 1;
    mode = 'slow';
    expect(await src.load('tower', 'landmark')).toBeNull(); // the probe timed out: no verdict
    mode = 'up';
    expect(await src.load('bench', 'prop')).not.toBeNull(); // the next request probes again and succeeds
    expect(resolve).toHaveBeenCalledTimes(3);
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

describe('AssetModelSource variants (every house its own library model)', () => {
  const variantRig = (answer: (query: string, variant: number) => AssetResult) => {
    const resolve = vi.fn(async (q: string, _k: unknown, _g: boolean, _o?: boolean, v = 0) => answer(q, v));
    const loadGltf = vi.fn(async () => ({ scene: new THREE.Group() }));
    const src = new AssetModelSource(() => false, { resolve, loadGltf, now: () => 1, sleep: async () => {} });
    return { src, resolve, loadGltf };
  };

  it('asks for each library variant once, passes it on, and loads a shared GLB URL once', async () => {
    const { src, resolve, loadGltf } = variantRig((_q, v) => ({ status: 'ready', source: 'library', url: `http://x/house-${v % 2}.glb` }));
    const [h0, h1, h2] = await Promise.all([src.load('house', 'structure', 0), src.load('house', 'structure', 1), src.load('house', 'structure', 2)]);
    expect(h0 && h1 && h2).toBeTruthy();
    expect(resolve.mock.calls.map((c) => c[4]).sort()).toEqual([0, 1, 2]);
    expect(resolve.mock.calls.every((c) => c[3] === true)).toBe(true);
    expect(loadGltf).toHaveBeenCalledTimes(2); // variant 2 is the same file as variant 0
    await src.load('house', 'structure', 1);
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('a base miss costs one request for the whole village (empty library)', async () => {
    const { src, resolve } = variantRig(() => NONE);
    for (let v = 0; v < 8; v++) expect(await src.load('house', 'structure', v)).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('an online or generated base model is reused for every variant without asking again', async () => {
    const { src, resolve } = variantRig(() => ({ status: 'ready', source: 'online', url: 'http://x/hut.glb' }));
    const a = await src.load('hut', 'structure', 0);
    expect(await src.load('hut', 'structure', 4)).toBe(a);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('a failed variant falls back to the base model; variants are clamped to the backend range', async () => {
    const { src, resolve } = variantRig((_q, v) => (v === 0 ? READY : DOWN));
    const base = await src.load('house', 'structure', 0);
    expect(await src.load('house', 'structure', 500)).toBe(base);
    expect(resolve.mock.calls[1][4]).toBe(99);
  });
});

describe('AssetModelSource: built parts, tints and messages', () => {
  const PARTS = [{ shape: 'box' as const, at: [0, 0.5, 0] as [number, number, number], size: [1, 1, 1] as [number, number, number], color: '#cc2222' }];

  it('builds a model from parts without loading any file', async () => {
    const { src, loadGltf } = rig(() => ({ status: 'ready', source: 'procedural', parts: PARTS }));
    const out = await src.load('red cube', 'prop');
    expect(out?.source).toBe('procedural');
    expect(out?.object.children).toHaveLength(1);
    expect(loadGltf).not.toHaveBeenCalled();
  });

  it('waits for a job, and only then builds', async () => {
    const { src, job } = rig(() => ({ status: 'pending', jobId: 'j' }));
    job.mockResolvedValueOnce({ status: 'pending', jobId: 'j' }).mockResolvedValueOnce({ status: 'ready', source: 'procedural', parts: PARTS });
    expect((await src.load('robot', 'landmark'))?.source).toBe('procedural');
    expect(job).toHaveBeenCalledTimes(2);
  });

  it('tints a copy, never the loaded file everyone shares', async () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#ffffff' })));
    const { src, loadGltf } = rig(() => ({ status: 'ready', source: 'online', url: 'http://x/l.glb', tint: '#cc2222' }));
    loadGltf.mockResolvedValue({ scene });
    const out = await src.load('red lighthouse', 'landmark');
    expect(out?.object).not.toBe(scene);
    expect(((scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ffffff');
  });

  it('tells the player in order, each message once per world', async () => {
    const said: string[] = [];
    const { src, job } = rig(() => ({ status: 'pending', jobId: 'j', notices: ['Meshy API key is missing', 'Building a robot manually'] }));
    job.mockResolvedValue({ status: 'ready', source: 'procedural', parts: PARTS, notices: ['Meshy API key is missing', 'Building a robot manually'] });
    src.onNotice = (t) => said.push(t);
    await src.load('robot', 'landmark');
    expect(said).toEqual(['Meshy API key is missing', 'Building a robot manually']);
    await src.load('tower', 'landmark');
    expect(said).toHaveLength(2);
    src.reset();
    await src.load('dragon', 'landmark');
    expect(said).toHaveLength(4);
  });

  it('passes on why nothing could be built', async () => {
    const said: string[] = [];
    const { src } = rig(() => ({ status: 'none', notices: ['Could not build a robot'] }));
    src.onNotice = (t) => said.push(t);
    expect(await src.load('robot', 'prop')).toBeNull();
    expect(said).toEqual(['Could not build a robot']);
  });
});
