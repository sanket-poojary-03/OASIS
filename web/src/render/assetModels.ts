import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetJob, clampVariant, resolveAsset } from '../api/client';
import type { AssetResult } from '../api/types';
import type { PlaceKind } from '../core/recipe';
import type { ModelSource } from './worldObjects';

type Loaded = { object: THREE.Object3D; source: 'library' | 'online' | 'generated'; credit?: string } | null;

/** A definitive "no model" (HTTP-200 none, incl. limiter refusals) is not asked again for this long: the limiter window. */
export const MISS_TTL_MS = 10 * 60_000;
/** A transient miss (backend unreachable, 429/5xx, a job still running, a GLB that failed to load) is retried after this. */
export const TRANSIENT_TTL_MS = 45_000;
/** Any transport failure stops all asset requests for this long; then a single probe decides whether to resume. */
export const BREAKER_MS = 30_000;

export interface AssetDeps {
  resolve?: (query: string, kind: PlaceKind, allowGenerate: boolean, allowOnline?: boolean, variant?: number) => Promise<AssetResult>;
  job?: (id: string) => Promise<AssetResult>;
  loadGltf?: (url: string) => Promise<{ scene: THREE.Object3D }>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Asks the backend model finder (library, cache, Poly Pizza, Sketchfab, Meshy job for landmarks); polls jobs every 5 s
 * for up to 5 min. `none` or any failure resolves null so the caller keeps the placeholder. World rebuilds call load()
 * for every object, so: successes and in-flight requests are shared per asset; misses are remembered with an expiry;
 * and a transport failure opens a source-wide breaker so an offline edit costs no requests at all.
 * Variants (house 0, 1, 2…) ride on the base lookup: a variant is asked for only when the base model came from the
 * library (only library ties rotate), and identical GLB URLs are loaded once.
 */
export class AssetModelSource implements ModelSource {
  private readonly cache = new Map<string, Promise<Loaded>>();
  private readonly gltfs = new Map<string, Promise<{ scene: THREE.Object3D }>>();
  private readonly misses = new Map<string, number>();
  private offlineUntil = 0;
  private tripped = false;
  private probing = false;
  private readonly resolve: NonNullable<AssetDeps['resolve']>;
  private readonly job: NonNullable<AssetDeps['job']>;
  private readonly loadGltf: NonNullable<AssetDeps['loadGltf']>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly allowGenerate: (kind: PlaceKind) => boolean = (k) => k === 'landmark', deps: AssetDeps = {}) {
    let loader: GLTFLoader | null = null;
    this.resolve = deps.resolve ?? resolveAsset;
    this.job = deps.job ?? assetJob;
    this.loadGltf = deps.loadGltf ?? ((url) => (loader ??= new GLTFLoader()).loadAsync(url));
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Forget every miss and close the breaker: a new world is being generated, or the backend answered health. */
  reset(): void {
    this.misses.clear();
    this.offlineUntil = 0;
    this.tripped = false;
    this.probing = false;
  }

  load(asset: string, kind: PlaceKind, variant = 0): Promise<Loaded> {
    const base = `${kind}:${asset.toLowerCase().trim()}`;
    const v = clampVariant(variant);
    const first = this.request(base, asset, kind, 0);
    if (v === 0) return first;
    // No model, or an online/generated one (the same for every variant): no extra request. A failed variant keeps the base.
    return first.then((b) => (b?.source === 'library' ? this.request(`${base}#${v}`, asset, kind, v).then((r) => r ?? b) : b));
  }

  private request(key: string, asset: string, kind: PlaceKind, variant: number): Promise<Loaded> {
    const known = this.cache.get(key);
    if (known) return known;
    const now = this.now();
    if ((this.misses.get(key) ?? 0) > now) return Promise.resolve(null);
    if (this.tripped && (now < this.offlineUntil || this.probing)) return Promise.resolve(null);
    if (this.tripped) this.probing = true; // breaker window over: this request is the one probe
    const p = this.fetch(asset, kind, variant).then(({ value, retryAfter }) => {
      if (value === null) {
        if (this.cache.get(key) === p) this.cache.delete(key);
        this.misses.set(key, this.now() + retryAfter);
      }
      return value;
    });
    this.cache.set(key, p);
    return p;
  }

  /** Breaker bookkeeping for every answer from the asset API (resolve or job poll). */
  private noteTransport(res: AssetResult): void {
    if (res.status === 'none' && res.transient) {
      this.tripped = true;
      this.offlineUntil = this.now() + BREAKER_MS;
    } else {
      this.tripped = false;
    }
    this.probing = false;
  }

  /** One GLB per URL: variants that resolve to the same library file share the parsed scene (callers clone it). */
  private gltf(url: string): Promise<{ scene: THREE.Object3D }> {
    let p = this.gltfs.get(url);
    if (!p) {
      p = this.loadGltf(url);
      this.gltfs.set(url, p);
      p.catch(() => { if (this.gltfs.get(url) === p) this.gltfs.delete(url); });
    }
    return p;
  }

  private async fetch(asset: string, kind: PlaceKind, variant: number): Promise<{ value: Loaded; retryAfter: number }> {
    const miss = (r: AssetResult) => ({ value: null, retryAfter: r.status === 'none' && !r.transient ? MISS_TTL_MS : TRANSIENT_TTL_MS });
    let res = await this.resolve(asset, kind, this.allowGenerate(kind), true, variant);
    this.noteTransport(res);
    let flaky = 0;
    for (let i = 0; res.status === 'pending' && res.jobId && i < 60; i++) {
      await this.sleep(5000);
      const next = await this.job(res.jobId);
      // Tolerate a few unreachable polls before giving up; a definitive answer (ready / none) ends the wait.
      if (next.status === 'none' && next.transient && ++flaky < 4) continue;
      this.noteTransport(next);
      res = next;
    }
    if (res.status !== 'ready' || !res.url) return miss(res);
    try {
      const gltf = await this.gltf(res.url);
      return { value: { object: gltf.scene, source: res.source ?? 'generated', credit: res.credit }, retryAfter: 0 };
    } catch {
      return { value: null, retryAfter: TRANSIENT_TTL_MS };
    }
  }
}
