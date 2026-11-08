import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ART from '../../../shared/fixtures/art-queries.json';
import { resolveAsset } from '../api/client';
import type { AssetResult } from '../api/types';
import type { AnimalKind, Wildlife } from '../logic/wildlife';
import { SCATTER_KINDS as KINDS, type ScatterKind } from '../world/scatter';
import { matteMaterials } from './matte';
import { drawnVariants, type ScatterAssets } from './scatterAssets';

type Gltf = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

const SCATTER_KINDS: ReadonlySet<string> = new Set<string>(KINDS);
/** Variants asked for per scatter kind (the library rotates equally good models: tree 1…5); stops at the first repeat. */
export const SCATTER_VARIANTS = 5;
// The player is not here: the bundled characters (player/characters.ts) dress it, with or without a backend. Nor is the
// rabbit: the library has none, and the base art must not wait on a server to be told so.
const RIGGED_USES: ReadonlySet<string> = new Set(['deer']);

/**
 * The base-art queries live in shared/fixtures/art-queries.json so the backend tests can check them against the real
 * library manifest (ruling I4: the tagging contract makes "pine tree" and "dead tree" pick the kind models).
 */
export const SCATTER_ART = ART.scatter.filter((e) => SCATTER_KINDS.has(e.kind)) as Array<{ kind: ScatterKind; query: string; height: number }>;
export const RIGGED_ART = ART.rigged.filter((e) => RIGGED_USES.has(e.use)) as Array<{ use: AnimalKind; query: string; height: number }>;

export interface ArtDeps {
  resolve?: (query: string, variant?: number) => Promise<AssetResult>;
  loadGltf?: (url: string) => Promise<Gltf>;
  /** Called after each scatter kind switches to its pack model, so live chunks can be re-instanced. */
  onScatter?: () => void;
}

export interface ArtReport { loaded: string[]; missing: string[] }

/**
 * Loads the CC0 pack art (scatter, deer and rabbits) concurrently and hot-swaps each piece in as it
 * arrives. Library only: never online or generated, so the base look is consistent and free. One request per query,
 * once per page; anything missing (empty library, backend down, bad GLB) keeps its procedural fallback.
 */
export async function loadArt(scatter: ScatterAssets, wildlife: Wildlife, deps: ArtDeps = {}): Promise<ArtReport> {
  let loader: GLTFLoader | null = null;
  const resolve = deps.resolve ?? ((query: string, variant = 0) => resolveAsset(query, 'prop', false, false, variant));
  const fetchGltf = deps.loadGltf ?? ((url: string) => (loader ??= new GLTFLoader()).loadAsync(url));
  const loadGltf = (url: string): Promise<Gltf> => fetchGltf(url).then((g) => { matteMaterials(g.scene); return g; });
  const report: ArtReport = { loaded: [], missing: [] };

  const one = async (query: string, apply: (g: Gltf) => void): Promise<void> => {
    try {
      const res = await resolve(query);
      if (res.status !== 'ready' || !res.url || res.source !== 'library') { report.missing.push(query); return; }
      apply(await loadGltf(res.url));
      report.loaded.push(query);
    } catch (e) {
      console.warn('[art] could not use', query, e);
      report.missing.push(query);
    }
  };

  /** Every variant of a scatter kind (tree 1…5), one after another: the first arrives fast, the rest add variety. */
  const variants = async (e: (typeof SCATTER_ART)[number]): Promise<void> => {
    const seen = new Set<string>();
    // No more than a kind ever draws (a model that is loaded and never shown only costs time).
    for (let v = 0; v < Math.min(SCATTER_VARIANTS, drawnVariants(e.kind)); v++) {
      try {
        const res = await resolve(e.query, v);
        if (res.status !== 'ready' || !res.url || res.source !== 'library') { if (v === 0) report.missing.push(e.query); return; }
        if (seen.has(res.url)) return; // the library has no more distinct models for this kind
        seen.add(res.url);
        const before = scatter.modelCount(e.kind);
        scatter.useModel(e.kind, (await loadGltf(res.url)).scene, e.height);
        if (scatter.modelCount(e.kind) === before) throw new Error('model has no usable meshes');
        if (v === 0) report.loaded.push(e.query);
        deps.onScatter?.();
      } catch (err) {
        console.warn('[art] could not use', e.query, v, err);
        if (v === 0) report.missing.push(e.query);
        return;
      }
    }
  };

  await Promise.all([
    ...SCATTER_ART.map(variants),
    ...RIGGED_ART.map((e) => one(e.query, (g) => {
      wildlife.useModel(e.use, { scene: g.scene, animations: g.animations, height: e.height });
    })),
  ]);
  return report;
}
