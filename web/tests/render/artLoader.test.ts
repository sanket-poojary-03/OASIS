import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetResult } from '../../src/api/types';
import { Wildlife } from '../../src/logic/wildlife';
import { loadArt, RIGGED_ART, SCATTER_ART } from '../../src/render/artLoader';
import { ScatterAssets } from '../../src/render/scatterAssets';
import { fakeTemplate } from './rigFixture';

afterEach(() => vi.unstubAllGlobals());

const rig = () => {
  const scene = new THREE.Scene();
  return { scatter: new ScatterAssets(), wildlife: new Wildlife(scene) };
};

describe('loadArt', () => {
  it('reads the plan queries from the shared list (I4: two-word kind queries kept)', () => {
    expect(SCATTER_ART.map((e) => e.query).slice(0, 7)).toEqual(['tree', 'pine tree', 'dead tree', 'bush', 'rock', 'cactus', 'reed']);
    expect(SCATTER_ART.map((e) => e.kind)).toEqual(expect.arrayContaining(['birch', 'palm', 'flowers', 'fern', 'mushroom', 'log']));
    expect(RIGGED_ART.map((e) => e.use)).toEqual(['deer', 'rabbit']); // the player is the bundled roster
  });

  it('asks the library only (never online or generated), one request per query', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'none' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const { scatter, wildlife } = rig();
    const report = await loadArt(scatter, wildlife);
    expect(f).toHaveBeenCalledTimes(SCATTER_ART.length + RIGGED_ART.length);
    for (const c of f.mock.calls) {
      const body = JSON.parse((c as unknown as [string, { body: string }])[1].body) as Record<string, unknown>;
      expect([body.allowOnline, body.allowGenerate]).toEqual([false, false]);
    }
    expect(report.loaded).toEqual([]);
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

  it('with a server, a kind without its model yet is not drawn (no placeholder trees)', () => {
    const scatter = new ScatterAssets();
    const items = [{ kind: 'birch' as const, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant: 0 }];
    expect(scatter.instance(items).children).toHaveLength(1); // offline: a stand-in shape
    scatter.standIns = false;
    expect(scatter.instance(items).children).toHaveLength(0);
  });
});
