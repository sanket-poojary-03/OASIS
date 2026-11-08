import { describe, expect, it } from 'vitest';
import { CORE_HALF, recipeSchema, type Recipe } from '../../src/core/recipe';
import { applyOps, describeOps, opsSchema } from '../../src/core/ops';
import { grassChunk } from '../../src/world/chunkData';
import { createField } from '../../src/world/field';
import { chunkInMap, clampToMap, insideMap, RIM_WIDTH } from '../../src/world/mapBounds';
import { scatterChunk, type ScatterKind } from '../../src/world/scatter';
import { loadOpsFixture, loadRecipeFixture } from '../fixtures';

const TREES: ScatterKind[] = ['tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'log', 'stump'];
const PLANTS: ScatterKind[] = ['bush', 'flowers', 'fern', 'mushroom', 'reed', 'cactus'];
const lush = (): Recipe => ({ ...loadRecipeFixture('fishing-valley'), climate: { temperature: 0.55, moisture: 0.65 } });

function kindsAcross(r: Recipe): Map<string, number> {
  const f = createField(r), out = new Map<string, number>();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) for (const it of scatterChunk(f, cx, cz)) out.set(it.kind, (out.get(it.kind) ?? 0) + 1);
  return out;
}
const total = (m: Map<string, number>, kinds: ScatterKind[]) => kinds.reduce((s, k) => s + (m.get(k) ?? 0), 0);

describe('nature: what grows is the AI\'s to say', () => {
  it('no trees means none at all, while plants and rocks stay', () => {
    const before = kindsAcross(lush());
    expect(total(before, TREES)).toBeGreaterThan(20);
    const after = kindsAcross({ ...lush(), nature: { trees: 0, plants: 1, rocks: 1 } });
    expect(total(after, TREES)).toBe(0);
    expect(total(after, PLANTS)).toBeGreaterThan(0);
    expect(total(after, ['rock', 'pebble'])).toBeGreaterThan(0);
  });

  it('barren ground has no plants and no wind grass', () => {
    const r: Recipe = { ...lush(), nature: { trees: 0, plants: 0, rocks: 1 } };
    expect(total(kindsAcross(r), PLANTS)).toBe(0);
    const f = createField(r);
    for (let cx = -2; cx <= 2; cx++) expect(grassChunk(f, cx, 0).length).toBe(0);
  });

  it('no rocks removes rocks, even on a lake bed', () => {
    const r: Recipe = { ...lush(), water: { river: true, lake: true }, nature: { trees: 1, plants: 1, rocks: 0 } };
    expect(total(kindsAcross(r), ['rock', 'pebble'])).toBe(0);
  });

  it('a dense forest has more trees than normal', () => {
    expect(total(kindsAcross({ ...lush(), nature: { trees: 2, plants: 1, rocks: 1 } }), TREES)).toBeGreaterThan(total(kindsAcross(lush()), TREES));
  });

  it('without it, a world is exactly as it was', () => {
    const f = createField(lush()), g = createField({ ...lush(), nature: { trees: 1, plants: 1, rocks: 1 } });
    expect(scatterChunk(f, 1, 1)).toEqual(scatterChunk(g, 1, 1));
  });

  it('the schema holds it to 0..2 and its own keys', () => {
    const r = lush();
    expect(recipeSchema.safeParse({ ...r, nature: { trees: 3 } }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...r, nature: { oaks: 1 } }).success).toBe(false);
    expect(recipeSchema.parse({ ...r, nature: { trees: 0 } }).nature).toEqual({ trees: 0, plants: 1, rocks: 1 });
  });

  it('can change while playing without moving anything', () => {
    const ops = opsSchema.parse(loadOpsFixture('no-trees'));
    const a = applyOps(lush(), ops);
    expect(a.recipe.nature?.trees).toBe(0);
    expect(a.terrainChanged).toBe(false);
    expect(a.changedPlaces.size).toBe(0);
    expect(describeOps(ops)[0]).toMatch(/trees/);
  });
});

describe('a fixed map', () => {
  it('has terrain only out to one ring past its edge', () => {
    const n = CORE_HALF / 64;
    expect(chunkInMap(0, 0)).toBe(true);
    expect(chunkInMap(n - 1, n - 1)).toBe(true);
    expect(chunkInMap(-n, -n)).toBe(true);
    expect(chunkInMap(n, 0)).toBe(true); // the ring that shows behind the edge
    expect(chunkInMap(n + 1, 0)).toBe(false);
    expect(chunkInMap(0, -n - 2)).toBe(false);
  });

  it('keeps a walker inside', () => {
    expect(clampToMap(0)).toBe(0);
    expect(clampToMap(5000)).toBeLessThan(CORE_HALF);
    expect(clampToMap(-5000)).toBeGreaterThan(-CORE_HALF);
    expect(insideMap(0, 0)).toBe(true);
    expect(insideMap(CORE_HALF + 1, 0)).toBe(false);
    expect(insideMap(clampToMap(5000), clampToMap(-5000))).toBe(true);
  });

  it('every land world rises to mountains at its edge, hiding where it ends', () => {
    for (const name of ['snowy-mountains', 'fishing-valley', 'desert-canyon'] as const) {
      const r = loadRecipeFixture(name);
      const f = createField({ ...r, terrain: { ...r.terrain, seaLevel: 0 } });
      for (let t = -400; t <= 400; t += 80) {
        expect(f.heightAt(CORE_HALF, t) - f.baseHeight(CORE_HALF, t), `${name} east ${t}`).toBeGreaterThan(15);
        expect(f.heightAt(CORE_HALF - RIM_WIDTH - 20, t), `${name} inside ${t}`).toBeCloseTo(f.baseHeight(CORE_HALF - RIM_WIDTH - 20, t), 5);
      }
    }
  });

  it('leaves the middle of the map alone', () => {
    const r = loadRecipeFixture('snowy-mountains');
    const f = createField({ ...r, water: { river: false, lake: false } });
    expect(f.heightAt(100, -200)).toBe(f.baseHeight(100, -200));
  });

  it('a sea stays open to the edge: no wall stands in the water', () => {
    const r = loadRecipeFixture('tropical-island');
    const f = createField(r);
    expect(f.hasSea).toBe(true);
    expect(f.heightAt(CORE_HALF, 0)).toBeLessThan(f.seaLevelY);
  });
});
