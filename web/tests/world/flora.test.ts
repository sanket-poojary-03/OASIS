import { describe, expect, it } from 'vitest';
import { applyOps, describeOps, opsSchema } from '../../src/core/ops';
import { recipeSchema, type Flora, type Recipe } from '../../src/core/recipe';
import { biomeAt } from '../../src/world/biome';
import { createField } from '../../src/world/field';
import { floraKey, layerOf, parseFloraKey, scatterChunk, type ScatterItem } from '../../src/world/scatter';
import { loadOpsFixture, loadRecipeFixture } from '../fixtures';

const lush = (): Recipe => ({ ...loadRecipeFixture('fishing-valley'), climate: { temperature: 0.55, moisture: 0.65 } });
const PRESET_TREES = ['tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'log', 'stump'];
const GROUND_COVER = ['flowers', 'fern', 'mushroom', 'reed'];
const spooky: Flora = { asset: 'twisted spooky tree', layer: 'canopy', density: 1, spot: 'anywhere' };

function itemsAcross(r: Recipe, span = 4): ScatterItem[] {
  const f = createField(r), out: ScatterItem[] = [];
  for (let cx = -span; cx <= span; cx++) for (let cz = -span; cz <= span; cz++) out.push(...scatterChunk(f, cx, cz));
  return out;
}
const count = (items: ScatterItem[], kind: string) => items.filter((i) => i.kind === kind).length;

describe('flora: the AI names what grows', () => {
  it('the schema fills in density and spot, and holds the list to its own keys and at most 8', () => {
    const r = lush();
    const parsed = recipeSchema.parse({ ...r, flora: [{ asset: 'alien tree', layer: 'canopy' }] });
    expect(parsed.flora).toEqual([{ asset: 'alien tree', layer: 'canopy', density: 1, spot: 'anywhere' }]);
    expect(recipeSchema.safeParse({ ...r, flora: [{ asset: 'alien tree', layer: 'tree' }] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...r, flora: [{ asset: 'alien tree', layer: 'canopy', colour: 'red' }] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...r, flora: [{ asset: 'alien tree', layer: 'canopy', density: 3 }] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...r, flora: Array.from({ length: 9 }, () => spooky) }).success).toBe(false);
  });

  it('a key carries its layer and asset', () => {
    expect(floraKey(spooky)).toBe('canopy:twisted spooky tree');
    expect(parseFloraKey('canopy:twisted spooky tree')).toEqual({ layer: 'canopy', asset: 'twisted spooky tree' });
    expect(parseFloraKey('pine')).toBeNull();
    expect(layerOf('rock:glowing crystal')).toBe('rock');
    expect(layerOf('birch')).toBe('canopy');
    expect(layerOf('cactus')).toBe('shrub');
    expect(layerOf('fern')).toBe('ground');
    expect(layerOf('pebble')).toBe('rock');
  });

  it('a named canopy replaces every preset tree, and the layers it did not name keep their preset kinds', () => {
    const items = itemsAcross({ ...lush(), flora: [spooky] });
    expect(count(items, 'canopy:twisted spooky tree')).toBeGreaterThan(30);
    expect(items.filter((i) => PRESET_TREES.includes(i.kind))).toEqual([]);
    expect(items.filter((i) => GROUND_COVER.includes(i.kind)).length).toBeGreaterThan(0);
  });

  it('two trees of one layer both grow, in patches of their own', () => {
    const items = itemsAcross({ ...lush(), flora: [spooky, { asset: 'willow', layer: 'canopy', density: 1, spot: 'anywhere' }] }, 6);
    const a = items.filter((i) => i.kind === 'canopy:twisted spooky tree'), b = items.filter((i) => i.kind === 'canopy:willow');
    expect(a.length).toBeGreaterThan(20);
    expect(b.length).toBeGreaterThan(20);
    // Patches: a tree's nearest other canopy tree is usually the same kind.
    const canopy = [...a, ...b];
    let same = 0;
    for (const t of canopy) {
      let best: ScatterItem | null = null, d = Infinity;
      for (const o of canopy) { const e = Math.hypot(o.x - t.x, o.z - t.z); if (o !== t && e < d) { d = e; best = o; } }
      if (best?.kind === t.kind) same++;
    }
    expect(same / canopy.length).toBeGreaterThan(0.8);
  });

  it('density scales how many: 0 is none, 2 is more than 1', () => {
    const at = (density: number) => count(itemsAcross({ ...lush(), flora: [{ ...spooky, density }] }), 'canopy:twisted spooky tree');
    expect(at(0)).toBe(0);
    expect(at(2)).toBeGreaterThan(at(1) * 1.5);
  });

  it('a spot is where a plant thrives: as thick as anywhere there, a quarter of that elsewhere, so a named layer never leaves land bare', () => {
    const r: Recipe = { ...lush(), water: { river: true, lake: true } };
    const f = createField(r);
    const cases: Array<[Flora, (i: ScatterItem) => boolean]> = [
      [{ asset: 'giant mushroom', layer: 'ground', density: 1, spot: 'wet' }, (i) => f.waterDistance(i.x, i.z) < 25],
      [{ asset: 'glowing crystal', layer: 'rock', density: 1, spot: 'high' }, (i) => f.heightAt(i.x, i.z) / f.amplitude > 0.55],
    ];
    for (const [plant, there] of cases) {
      const key = floraKey(plant);
      const spot = itemsAcross({ ...r, flora: [plant] }, 6).filter((i) => i.kind === key);
      const anywhere = itemsAcross({ ...r, flora: [{ ...plant, spot: 'anywhere' }] }, 6).filter((i) => i.kind === key);
      expect(spot.filter(there).length, plant.asset).toBe(anywhere.filter(there).length);
      expect(spot.filter(there).length, plant.asset).toBeGreaterThan(10);
      const away = spot.filter((i) => !there(i)).length, awayAnywhere = anywhere.filter((i) => !there(i)).length;
      expect(away, plant.asset).toBeGreaterThan(0);
      expect(away, plant.asset).toBeLessThan(awayAnywhere * 0.4);
    }
  });

  it('where a plant with a spot fits, it wins over its layer\'s others', () => {
    const r: Recipe = { ...lush(), water: { river: true, lake: true } };
    const f = createField(r);
    const items = itemsAcross({ ...r, flora: [spooky, { asset: 'willow', layer: 'canopy', density: 1, spot: 'wet' }] }, 6);
    const byWater = items.filter((i) => layerOf(i.kind) === 'canopy' && f.waterDistance(i.x, i.z) < 25);
    expect(byWater.length).toBeGreaterThan(5);
    expect(byWater.every((i) => i.kind === 'canopy:willow')).toBe(true);
  });

  it('nature still governs the amounts: no trees removes a named canopy too', () => {
    expect(count(itemsAcross({ ...lush(), flora: [spooky], nature: { trees: 0, plants: 1, rocks: 1 } }), 'canopy:twisted spooky tree')).toBe(0);
  });

  it('cliffs keep bare rock, and only rocks stand on steep ground', () => {
    const r: Recipe = { ...loadRecipeFixture('snowy-mountains'), flora: [{ ...spooky, asset: 'alien tree' }, { asset: 'blue fern', layer: 'ground', density: 2, spot: 'anywhere' }] };
    const f = createField(r);
    const items = itemsAcross(r, 3);
    expect(count(items, 'canopy:alien tree')).toBeGreaterThan(0);
    for (const i of items) {
      if (biomeAt(f, i.x, i.z) === 'rock' && !f.isWater(i.x, i.z)) expect(['rock', 'pebble']).toContain(i.kind);
      if (layerOf(i.kind) !== 'rock') expect(f.slopeAt(i.x, i.z)).toBeLessThanOrEqual(0.6);
    }
  });

  it('can change while playing without moving anything; an empty list goes back to the preset plants', () => {
    const ops = opsSchema.parse(loadOpsFixture('alien-flora'));
    const a = applyOps(lush(), ops);
    expect(a.recipe.flora).toEqual([
      { asset: 'alien tree', layer: 'canopy', density: 1.2, spot: 'anywhere' },
      { asset: 'glowing crystal', layer: 'rock', density: 1, spot: 'high' },
    ]);
    expect(a.terrainChanged).toBe(false);
    expect(a.changedPlaces.size).toBe(0);
    expect(describeOps(ops)[0]).toMatch(/alien tree/);
    expect(applyOps(a.recipe, opsSchema.parse([{ op: 'setFlora', flora: [] }])).recipe.flora).toBeUndefined();
  });

  it('is deterministic, and an empty list is the world without flora', () => {
    const r: Recipe = { ...lush(), flora: [spooky] };
    expect(scatterChunk(createField(r), 1, 2)).toEqual(scatterChunk(createField(r), 1, 2));
    expect(scatterChunk(createField({ ...lush(), flora: [] }), 1, 2)).toEqual(scatterChunk(createField(lush()), 1, 2));
  });
});
