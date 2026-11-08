import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetJob, clampVariant, resolveAsset } from '../api/client';
import type { AssetResult } from '../api/types';
import type { PlaceKind } from '../core/recipe';
import { matteMaterials } from './matte';
import { buildProcedural } from './proceduralModel';
import { tintedCopy } from './tint';
import type { ModelSource } from './worldObjects';

type Loaded = { object: THREE.Object3D; source: 'library' | 'online' | 'generated' | 'procedural'; credit?: string } | null;

/** A definitive "no model" (HTTP-200 none, incl. limiter refusals) is not asked again for this long: the limiter window. */
export const MISS_TTL_MS = 10 * 60_000;
/** A transient miss (backend unreachable, 429/5xx, a job still running, a GLB that failed to load) is retried after this. */
export const TRANSIENT_TTL_MS = 45_000;
/**
 * A transport failure (unreachable, 429, 5xx) stops all asset requests for this long; then a single probe decides
 * whether to resume. A timeout does not: it is only a transient miss for its own asset (m7).
 */
export const BREAKER_MS = 30_000;
/** A manual build takes seconds and Meshy minutes, so a job is asked about quickly at first. */
/**
 * Requests in flight at once. A browser opens about 6 connections to a server and the rest queue, with their timeout already
 * running: a world asking for 30 new models timed out most of them, and each was then left out though the server had built it.
 */
export const MAX_AT_ONCE = 5;
/** Tries for one request that keeps timing out. The server carries on and caches, so the next try is usually instant. */
const TIMEOUT_TRIES = 3;
const FAST_POLLS = 10;
const FAST_POLL_MS = 1500;
const POLL_MS = 5000;

export interface AssetDeps {
  resolve?: (query: string, kind: PlaceKind, allowGenerate: boolean, allowOnline?: boolean, variant?: number) => Promise<AssetResult>;
  job?: (id: string) => Promise<AssetResult>;
  loadGltf?: (url: string) => Promise<{ scene: THREE.Object3D }>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Asks the backend model finder (library, cache, online search with a vision check, Meshy job for landmarks, a manual build);
 * polls jobs for up to 5 min. `none` or any failure resolves null so the caller shows nothing. World rebuilds call load()
 * for every object, so: successes and in-flight requests are shared per asset; misses are remembered with an expiry;
 * and a transport failure opens a source-wide breaker so an unreachable backend costs no requests at all.
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
  private readonly told = new Set<string>();
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];
  /** Messages for the player about how a model is being made (Meshy unavailable, built manually). textContent only. */
  onNotice?: (text: string) => void;
  private readonly resolve: NonNullable<AssetDeps['resolve']>;
  private readonly job: NonNullable<AssetDeps['job']>;
  private readonly loadGltf: NonNullable<AssetDeps['loadGltf']>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** Any kind may be generated (Meshy, capped on the server) when nothing is found: the user wants no placeholders. */
  constructor(private readonly allowGenerate: (kind: PlaceKind) => boolean = () => true, deps: AssetDeps = {}) {
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
    this.told.clear();
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

  /** Breaker bookkeeping for every answer from the asset API (resolve or job poll). A timeout leaves it as it was. */
  private noteTransport(res: AssetResult): void {
    if (res.status === 'none' && res.transient && !res.timeout) {
      this.tripped = true;
      this.offlineUntil = this.now() + BREAKER_MS;
    } else if (!res.timeout) {
      this.tripped = false;
    }
    this.probing = false;
  }

  /** One lookup, waiting for its turn first, so its timeout only starts once it is really on its way. */
  private async ask(asset: string, kind: PlaceKind, variant: number): Promise<AssetResult> {
    if (this.inFlight >= MAX_AT_ONCE) await new Promise<void>((go) => this.queue.push(go));
    this.inFlight++;
    try {
      let res = await this.resolve(asset, kind, this.allowGenerate(kind), true, variant);
      for (let t = 1; res.status === 'none' && res.timeout && t < TIMEOUT_TRIES; t++) res = await this.resolve(asset, kind, this.allowGenerate(kind), true, variant);
      return res;
    } finally {
      this.inFlight--;
      this.queue.shift()?.();
    }
  }

  /** Each message once per world: every rejected landmark would say the Meshy key is missing. */
  private tell(res: AssetResult): void {
    for (const text of res.notices ?? []) {
      if (this.told.has(text)) continue;
      this.told.add(text);
      this.onNotice?.(text);
    }
  }

  /** One GLB per URL: variants that resolve to the same library file share the parsed scene (callers clone it). */
  private gltf(url: string): Promise<{ scene: THREE.Object3D }> {
    let p = this.gltfs.get(url);
    if (!p) {
      p = this.loadGltf(url).then((g) => { matteMaterials(g.scene); return g; });
      this.gltfs.set(url, p);
      p.catch(() => { if (this.gltfs.get(url) === p) this.gltfs.delete(url); });
    }
    return p;
  }

  private async fetch(asset: string, kind: PlaceKind, variant: number): Promise<{ value: Loaded; retryAfter: number }> {
    const miss = (r: AssetResult) => ({ value: null, retryAfter: r.status === 'none' && !r.transient ? MISS_TTL_MS : TRANSIENT_TTL_MS });
    let res = await this.ask(asset, kind, variant);
    this.noteTransport(res);
    this.tell(res);
    let flaky = 0;
    for (let i = 0; res.status === 'pending' && res.jobId && i < 60; i++) {
      await this.sleep(i < FAST_POLLS ? FAST_POLL_MS : POLL_MS);
      const next = await this.job(res.jobId);
      // Tolerate a few unreachable polls before giving up; a definitive answer (ready / none) ends the wait.
      if (next.status === 'none' && next.transient && ++flaky < 4) continue;
      this.noteTransport(next);
      this.tell(next);
      res = next;
    }
    if (res.status === 'ready' && res.parts) return { value: { object: buildProcedural(res.parts), source: 'procedural' }, retryAfter: 0 };
    if (res.status !== 'ready' || !res.url) return miss(res);
    try {
      const gltf = await this.gltf(res.url);
      const object = res.tint ? tintedCopy(gltf.scene, res.tint) : gltf.scene;
      return { value: { object, source: res.source ?? 'generated', credit: res.credit }, retryAfter: 0 };
    } catch {
      return { value: null, retryAfter: TRANSIENT_TTL_MS };
    }
  }
}
