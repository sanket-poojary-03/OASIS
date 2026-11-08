import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetResult } from '../../src/api/types';
import { Wildlife } from '../../src/logic/wildlife';
import { loadArt, loadFlora, RIGGED_ART, SCATTER_ART } from '../../src/render/artLoader';
import { FAR_TRIS, NEAR_TRIS } from '../../src/render/lightModel';
import { ScatterAssets } from '../../src/render/scatterAssets';
import { fakeTemplate } from './rigFixture';

afterEach(() => vi.unstubAllGlobals());

const rig = () => {
  const scene = new THREE.Scene();
  return { scatter: new ScatterAssets(), wildlife: new Wildlife(scene) };
};

describe('loadArt', () => {
  it('reads the plan queries from the shared list (I4: two-word kind queries kept)', () => {
    expect(SCATTER_ART.map((e) => e.query).slice(0, 7)).toEqual(['tree', 'pine tree', 'dead tree', 'flowering bush', 'rock', 'cactus', 'reed']);
    expect(SCATTER_ART.map((e) => e.kind)).toEqual(expect.arrayContaining(['birch', 'palm', 'flowers', 'fern', 'mushroom', 'log']));
    expect(RIGGED_ART.map((e) => e.use)).toEqual(['deer']); // the player is the bundled roster, and the library has no rabbit
  });

  it('needs no server at all: all of it ships with the site', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'none' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const { scatter, wildlife } = rig();
    const loadGltf = vi.fn(async (): Promise<never> => { throw new Error('not in this test'); });
    await loadArt(scatter, wildlife, { loadGltf });
    expect(f).not.toHaveBeenCalled();
    expect(loadGltf).toHaveBeenCalled();
    for (const [url] of loadGltf.mock.calls as unknown as string[][]) expect(url).toMatch(/^\/models\/bundled\//);
  });

  it('an empty library or a dead backend changes nothing: every piece keeps its procedural fallback', async () => {
    for (const answer of [{ status: 'none' }, { status: 'none', transient: true }] as AssetResult[]) {
      const { scatter, wildlife } = rig();
      const onScatter = vi.fn();
      const report = await loadArt(scatter, wildlife, { resolve: async () => answer, loadGltf: vi.fn(), onScatter });
      expect(report.missing).toHaveLength(SCATTER_ART.length + RIGGED_ART.length);
      expect(onScatter).not.toHaveBeenCalled();
      expect(SCATTER_ART.some((e) => scatter.hasModel(e.kind))).toBe(false);
    }
  });

  it('hot-swaps library models in as they arrive and ignores online answers and broken files', async () => {
    const { scatter, wildlife } = rig();
    const useDeer = vi.spyOn(wildlife, 'useModel');
    const onScatter = vi.fn();
    const answers: Record<string, AssetResult> = {
      rock: { status: 'ready', source: 'library', url: 'u/rock.glb' },
      'pine tree': { status: 'ready', source: 'online', url: 'u/pine.glb' },
      cactus: { status: 'ready', source: 'library', url: 'u/broken.glb' },
      deer: { status: 'ready', source: 'library', url: 'u/deer.glb' },
    };
    const loadGltf = vi.fn(async (url: string) => {
      if (url.includes('broken')) throw new Error('bad glb');
      const t = fakeTemplate(1);
      return { scene: t.scene, animations: t.animations };
    });
    const report = await loadArt(scatter, wildlife, { resolve: async (q) => answers[q] ?? { status: 'none' }, loadGltf, onScatter });
    expect(report.loaded.sort()).toEqual(['deer', 'rock']);
    expect(scatter.hasModel('rock')).toBe(true);
    expect(scatter.hasModel('pine')).toBe(false);
    expect(scatter.hasModel('cactus')).toBe(false);
    expect(onScatter).toHaveBeenCalledTimes(1);
    expect(useDeer).toHaveBeenCalledWith('deer', expect.objectContaining({ height: 1.5 }));
    expect(loadGltf).not.toHaveBeenCalledWith('u/pine.glb');
  });

  it('loads every distinct variant of a kind (tree 1…3 here), stopping at the first repeat', async () => {
    const { scatter, wildlife } = rig();
    const resolve = vi.fn(async (q: string, v = 0): Promise<AssetResult> =>
      q === 'tree' ? { status: 'ready', source: 'library', url: `u/tree-${v % 3}.glb` } : { status: 'none' });
    const loadGltf = vi.fn(async () => { const t = fakeTemplate(1); return { scene: t.scene, animations: t.animations }; });
    await loadArt(scatter, wildlife, { resolve, loadGltf });
    expect(scatter.modelCount('tree')).toBe(3);
    expect(loadGltf).toHaveBeenCalledTimes(3);
    const items = [0, 1, 2, 3].map((variant) => ({ kind: 'tree' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant }));
    expect(scatter.instance(items).children).toHaveLength(3); // one instanced mesh per variant used
  });

  it('flora: each named plant is fetched from the library alone, every distinct variant, and draws its own model', async () => {
    const scatter = new ScatterAssets();
    scatter.standIns = false;
    const resolve = vi.fn(async (q: string, v = 0): Promise<AssetResult> =>
      q === 'twisted spooky tree' ? { status: 'ready', source: 'library', url: `u/twisted-${v % 2}.glb` } : { status: 'none' });
    const loadGltf = vi.fn(async () => { const t = fakeTemplate(1); return { scene: t.scene, animations: t.animations }; });
    const onScatter = vi.fn();
    const report = await loadFlora(scatter, [{ asset: 'Twisted Spooky Tree', layer: 'canopy', density: 1, spot: 'anywhere' }], { resolve, loadGltf, onScatter });
    expect(report).toEqual({ loaded: ['twisted spooky tree'], missing: [] });
    expect(scatter.modelCount('canopy:twisted spooky tree')).toBe(2);
    expect(onScatter).toHaveBeenCalled();
    const items = [{ kind: 'canopy:twisted spooky tree' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 }];
    expect(scatter.instance(items).children).toHaveLength(1);
  });

  it('flora: a plant the library lacks (or only online has) grows as its layer\'s preset model, and is reported', async () => {
    const scatter = new ScatterAssets();
    scatter.standIns = false;
    scatter.useModel('tree', fakeTemplate(1).scene, 6);
    const resolve = async (q: string): Promise<AssetResult> => (q === 'bamboo' ? { status: 'ready', source: 'online', url: 'u/bamboo.glb' } : { status: 'none' });
    const loadGltf = vi.fn();
    const report = await loadFlora(scatter, [{ asset: 'bamboo', layer: 'canopy', density: 1, spot: 'anywhere' }], { resolve, loadGltf });
    expect(report.missing).toEqual(['bamboo']);
    expect(loadGltf).not.toHaveBeenCalled();
    const items = [{ kind: 'canopy:bamboo' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 }];
    expect(scatter.instance(items).children).toHaveLength(1); // drawn with the oak
  });

  it('a heavy model is held to the near budget, and drawn lighter still in the outer rings', async () => {
    const scatter = new ScatterAssets();
    scatter.standIns = false;
    const heavy = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial()));
      return g;
    };
    const resolve = async (q: string): Promise<AssetResult> => (q === 'twisted spooky tree' ? { status: 'ready', source: 'library', url: 'u/twisted.glb' } : { status: 'none' });
    await loadFlora(scatter, [{ asset: 'twisted spooky tree', layer: 'canopy', density: 1, spot: 'anywhere' }], { resolve, loadGltf: async () => ({ scene: heavy(), animations: [] }) });
    const item = { kind: 'canopy:twisted spooky tree' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 };
    const tris = (lod: number) => ((scatter.instance([item], lod).children[0] as THREE.InstancedMesh).geometry.getAttribute('position').count / 3);
    expect(tris(0)).toBeLessThanOrEqual(NEAR_TRIS * 1.1);
    expect(tris(0)).toBeGreaterThan(NEAR_TRIS * 0.5);
    expect(tris(1)).toBeLessThanOrEqual(FAR_TRIS * 1.1);
  });

  it('flora: a plant already asked for is not fetched again (a rebuild or edit keeps it)', async () => {
    const scatter = new ScatterAssets();
    const resolve = vi.fn(async (): Promise<AssetResult> => ({ status: 'none' }));
    const flora = [{ asset: 'willow', layer: 'canopy' as const, density: 1, spot: 'anywhere' as const }];
    await loadFlora(scatter, flora, { resolve, loadGltf: vi.fn() });
    const second = await loadFlora(scatter, flora, { resolve, loadGltf: vi.fn() });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ loaded: [], missing: [] });
  });

  it('with a server, a kind without its model yet is not drawn (no placeholder trees)', () => {
    const scatter = new ScatterAssets();
    const items = [{ kind: 'birch' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 }];
    expect(scatter.instance(items).children).toHaveLength(1); // offline: a stand-in shape
    scatter.standIns = false;
    expect(scatter.instance(items).children).toHaveLength(0);
  });
});
