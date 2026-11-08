import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ART from '../../../shared/fixtures/art-queries.json';
import { resolveAsset } from '../api/client';
import type { AssetResult } from '../api/types';
import type { Flora, FloraLayer } from '../core/recipe';
import type { AnimalKind, Wildlife } from '../logic/wildlife';
import { floraKey, SCATTER_KINDS as KINDS, type ItemKind, type ScatterKind } from '../world/scatter';
import { matteMaterials } from './matte';
import { drawnVariants, FLORA_FALLBACK, type ScatterAssets } from './scatterAssets';

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

  const resolveVariants = libraryVariants(scatter, resolve, loadGltf, deps.onScatter);
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

  const variants = async (e: (typeof SCATTER_ART)[number]): Promise<void> => {
    (await resolveVariants(e.kind, e.query, e.height) ? report.loaded : report.missing).push(e.query);
  };

  await Promise.all([
    ...SCATTER_ART.map(variants),
    ...RIGGED_ART.map((e) => one(e.query, (g) => {
      wildlife.useModel(e.use, { scene: g.scene, animations: g.animations, height: e.height });
    })),
  ]);
  return report;
}

/** A named plant's height in metres when the AI gave none, by layer. */
const FLORA_HEIGHT: Record<FloraLayer, number> = { canopy: 7, shrub: 1.4, ground: 0.6, rock: 1.2 };

/**
 * The plants a world names (recipe `flora`), from the library alone like the base art: CC0, one look, and light enough
 * to draw by the thousand. A plant the library lacks grows as its layer's preset kind (FLORA_FALLBACK) and is reported,
 * so the player can be told. Each plant is asked for once per page; a rebuild or an edit reuses it.
 */
export async function loadFlora(scatter: ScatterAssets, flora: readonly Flora[], deps: ArtDeps = {}): Promise<ArtReport> {
  let loader: GLTFLoader | null = null;
  const resolve = deps.resolve ?? ((query: string, variant = 0) => resolveAsset(query, 'prop', false, false, variant));
  const fetchGltf = deps.loadGltf ?? ((url: string) => (loader ??= new GLTFLoader()).loadAsync(url));
  const loadGltf = (url: string): Promise<Gltf> => fetchGltf(url).then((g) => { matteMaterials(g.scene); return g; });
  const resolveVariants = libraryVariants(scatter, resolve, loadGltf, deps.onScatter);
  const report: ArtReport = { loaded: [], missing: [] };
  await Promise.all(flora.map(async (f) => {
    const kind = floraKey(f);
    if (!scatter.claim(kind)) return;
    const asset = kind.slice(f.layer.length + 1);
    if (await resolveVariants(kind, asset, f.height ?? FLORA_HEIGHT[f.layer])) { report.loaded.push(asset); return; }
    scatter.useFallback(kind, FLORA_FALLBACK[f.layer]);
    report.missing.push(asset);
    deps.onScatter?.();
  }));
  return report;
}

/**
 * Every library variant of a kind (tree 1…5), one after another: the first arrives fast, the rest add variety. Stops at
 * the first repeat, and never loads more than the kind draws. True if at least one model is in use.
 */
function libraryVariants(scatter: ScatterAssets, resolve: NonNullable<ArtDeps['resolve']>, loadGltf: (url: string) => Promise<Gltf>, onScatter?: () => void) {
  return async (kind: ItemKind, query: string, height: number): Promise<boolean> => {
    const seen = new Set<string>();
    for (let v = 0; v < Math.min(SCATTER_VARIANTS, drawnVariants(kind)); v++) {
      try {
        const res = await resolve(query, v);
        if (res.status !== 'ready' || !res.url || res.source !== 'library') return v > 0;
        if (seen.has(res.url)) return true; // the library has no more distinct models for this kind
        seen.add(res.url);
        const before = scatter.modelCount(kind);
        scatter.useModel(kind, (await loadGltf(res.url)).scene, height);
        if (scatter.modelCount(kind) === before) throw new Error('model has no usable meshes');
        onScatter?.();
      } catch (err) {
        console.warn('[art] could not use', query, v, err);
        return v > 0;
      }
    }
    return true;
  };
}
