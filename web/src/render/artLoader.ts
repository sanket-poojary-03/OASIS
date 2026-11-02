import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ART from '../../../shared/fixtures/art-queries.json';
import { resolveAsset } from '../api/client';
import type { AssetResult } from '../api/types';
import type { AnimalKind, Wildlife } from '../logic/wildlife';
import type { Avatar } from '../player/avatar';
import type { ScatterKind } from '../world/scatter';
import type { ScatterAssets } from './scatterAssets';

type Gltf = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

const SCATTER_KINDS: ReadonlySet<string> = new Set<ScatterKind>(['tree', 'pine', 'dead_tree', 'bush', 'rock', 'cactus', 'reed']);
const RIGGED_USES: ReadonlySet<string> = new Set(['player', 'deer', 'rabbit']);

/**
 * The base-art queries live in shared/fixtures/art-queries.json so the backend tests can check them against the real
 * library manifest (ruling I4: the tagging contract makes "pine tree" and "dead tree" pick the kind models).
 */
export const SCATTER_ART = ART.scatter.filter((e) => SCATTER_KINDS.has(e.kind)) as Array<{ kind: ScatterKind; query: string; height: number }>;
export const RIGGED_ART = ART.rigged.filter((e) => RIGGED_USES.has(e.use)) as Array<{ use: 'player' | AnimalKind; query: string; height: number }>;

export interface ArtDeps {
  resolve?: (query: string) => Promise<AssetResult>;
  loadGltf?: (url: string) => Promise<Gltf>;
  /** Called after each scatter kind switches to its pack model, so live chunks can be re-instanced. */
  onScatter?: () => void;
}

export interface ArtReport { loaded: string[]; missing: string[] }

/**
 * Loads the CC0 pack art (scatter, the adventurer, deer and rabbits) concurrently and hot-swaps each piece in as it
 * arrives. Library only: never online or generated, so the base look is consistent and free. One request per query,
 * once per page; anything missing (empty library, backend down, bad GLB) keeps its procedural fallback.
 */
export async function loadArt(scatter: ScatterAssets, wildlife: Wildlife, avatar: Avatar, deps: ArtDeps = {}): Promise<ArtReport> {
  let loader: GLTFLoader | null = null;
  const resolve = deps.resolve ?? ((query: string) => resolveAsset(query, 'prop', false, false));
  const loadGltf = deps.loadGltf ?? ((url: string) => (loader ??= new GLTFLoader()).loadAsync(url));
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

  await Promise.all([
    ...SCATTER_ART.map((e) => one(e.query, (g) => {
      scatter.useModel(e.kind, g.scene, e.height);
      if (!scatter.hasModel(e.kind)) throw new Error('model has no usable meshes');
      deps.onScatter?.();
    })),
    ...RIGGED_ART.map((e) => one(e.query, (g) => {
      const t = { scene: g.scene, animations: g.animations, height: e.height };
      if (e.use === 'player') avatar.use(t);
      else wildlife.useModel(e.use, t);
    })),
  ]);
  return report;
}
