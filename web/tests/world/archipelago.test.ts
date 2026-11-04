import { describe, expect, it } from 'vitest';
import { recipeSchema } from '../../src/core/recipe';
import { createField } from '../../src/world/field';
import { loadRecipeFixture } from '../fixtures';

/** Land share, separate islets (flood fill on a 16 m grid) and whether the centre is dry, for an archipelago world. */
function survey(seed: number, seaLevel = 0.6) {
  const base = loadRecipeFixture('tropical-island');
  const recipe = recipeSchema.parse({ ...base, seed, terrain: { shape: 'archipelago', roughness: 0.5, height: 0.3, seaLevel } });
  const f = createField(recipe);
  const step = 16, side = Math.floor(1024 / step) + 1, land = new Uint8Array(side * side);
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) land[r * side + c] = f.isWater(-512 + c * step, -512 + r * step) ? 0 : 1;
  const seen = new Uint8Array(side * side);
  let islets = 0;
  for (let i = 0; i < land.length; i++) {
    if (!land[i] || seen[i]) continue;
    let size = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!; size++;
      const r = Math.floor(j / side), c = j % side;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc, k = rr * side + cc;
        if (rr >= 0 && cc >= 0 && rr < side && cc < side && land[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (size >= 4) islets++; // at least ~1,000 m²
  }
  return { share: land.reduce((t, v) => t + v, 0) / land.length, islets, centre: !f.isWater(0, 0) };
}

describe('archipelago terrain', () => {
  it.each([[1, 0.6], [42, 0.5], [7404, 0.65], [846752854, 0.55]])('seed %i, sea level %f: many islets in open sea, land at the centre', (seed, sea) => {
    const s = survey(seed, sea);
    expect(s.share).toBeGreaterThan(0.1);
    expect(s.share).toBeLessThan(0.3);
    expect(s.islets).toBeGreaterThanOrEqual(5);
    expect(s.centre).toBe(true);
  });
});

describe('roads in a water world', () => {
  it('never bridge open sea between islets, and a river-sized crossing still gets its bridge', async () => {
    const { findRoad, longestBridge, MAX_BRIDGE } = await import('../../src/world/roads');
    const base = loadRecipeFixture('tropical-island');
    const f = createField(recipeSchema.parse({ ...base, seed: 42, terrain: { shape: 'archipelago', roughness: 0.5, height: 0.3, seaLevel: 0.6 } }));
    // dry points far apart: most pairs lie on different islets
    const dry: Array<{ x: number; z: number }> = [];
    for (let x = -400; x <= 400 && dry.length < 12; x += 37) for (let z = -400; z <= 400 && dry.length < 12; z += 53) if (!f.isWater(x, z) && f.slopeAt(x, z) < 0.4 && dry.every((d) => Math.hypot(d.x - x, d.z - z) > 150)) dry.push({ x, z });
    let none = 0;
    for (let i = 1; i < dry.length; i++) {
      const road = findRoad(f, dry[0], dry[i]);
      if (!road) { none++; continue; }
      expect(longestBridge(road)).toBeLessThanOrEqual(MAX_BRIDGE);
    }
    expect(none).toBeGreaterThan(0);
    const fishing = createField(loadRecipeFixture('fishing-valley'));
    const r = fishing.river[Math.floor(fishing.river.length / 2)];
    const across = findRoad(fishing, { x: r.x - 60, z: r.z }, { x: r.x + 60, z: r.z });
    expect(across?.bridges.some(Boolean)).toBe(true);
  });
});

describe('isUrban', () => {
  it('is a city only when the members are city buildings', async () => {
    const { isUrban } = await import('../../src/world/layouts');
    const grid = (asset: string, variants?: string[]) => ({ id: 'g', kind: 'settlement', label: 'G', asset, size: 'large', interaction: 'none', where: [], layout: { pattern: 'grid', height: 'low', variants } }) as never;
    expect(isUrban(grid('terrace coral garden bed'))).toBe(false);
    expect(isUrban(grid('market stall'))).toBe(false);
    expect(isUrban(grid('stone house'))).toBe(false);
    expect(isUrban(grid('glass tower'))).toBe(true);
    expect(isUrban(grid('stone house', ['coffee shop']))).toBe(true);
  });
});
