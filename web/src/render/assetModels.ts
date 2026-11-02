import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetJob, resolveAsset } from '../api/client';
import type { PlaceKind } from '../core/recipe';
import type { ModelSource } from './worldObjects';

type Loaded = { object: THREE.Object3D; source: 'library' | 'online' | 'generated'; credit?: string } | null;

/** Asks the backend model finder (library, cache, Poly Pizza, Sketchfab, Meshy job for landmarks); polls jobs every 5 s for up to 5 min. `none` or any failure resolves null so the caller uses the placeholder. */
export class AssetModelSource implements ModelSource {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Loaded>>();

  constructor(private readonly allowGenerate: (kind: PlaceKind) => boolean = (k) => k === 'landmark') {}

  load(asset: string, kind: PlaceKind): Promise<Loaded> {
    const key = `${kind}:${asset.toLowerCase().trim()}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.fetch(asset, kind);
      this.cache.set(key, p);
      // Do not cache failures: a transient error should retry on the next request.
      void p.then((v) => { if (v === null && this.cache.get(key) === p) this.cache.delete(key); });
    }
    return p;
  }

  private async fetch(asset: string, kind: PlaceKind): Promise<Loaded> {
    let res = await resolveAsset(asset, kind, this.allowGenerate(kind));
    let failures = 0;
    for (let i = 0; res.status === 'pending' && res.jobId && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const next = await assetJob(res.jobId);
      // assetJob maps network errors to 'none'; tolerate a few before giving up.
      if (next.status === 'none' && ++failures < 4) continue;
      res = next;
    }
    if (res.status !== 'ready' || !res.url) return null;
    try {
      const gltf = await this.loader.loadAsync(res.url);
      return { object: gltf.scene, source: res.source ?? 'generated', credit: res.credit };
    } catch {
      return null;
    }
  }
}
