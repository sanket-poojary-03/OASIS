import { describe, expect, it } from 'vitest';
import { applyOps } from '../../src/core/ops';
import { clampCore, type Recipe } from '../../src/core/recipe';
import { buildWorld, type BuiltWorld } from '../../src/world/build';
import type { WorldField } from '../../src/world/field';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

/** Heights on a 41 x 41 grid over the core (25 m steps), plus a fine ring around every placement. */
function sample(field: WorldField, w: BuiltWorld): number[] {
  const out: number[] = [];
  for (let z = -500; z <= 500; z += 25) for (let x = -500; x <= 500; x += 25) out.push(field.heightAt(x, z));
  for (const p of w.placements) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const d of [0, p.radius * 0.5, p.radius, p.radius * 1.4]) out.push(field.heightAt(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d));
  }
  return out;
}

/** Rebuilding with every placement kept (undo, or an edit that keeps them) must reproduce the same terrain. */
function expectStableRebuild(w: BuiltWorld): void {
  const again = buildWorld(w.recipe, w.placements);
  expect(again.field.pads).toEqual(w.field.pads);
  expect(sample(again.field, again)).toEqual(sample(w.field, w));
  expect(again.buildings).toEqual(w.buildings);
}

function withLighthouseAt(r: Recipe, x: number, z: number): Recipe {
  return applyOps(r, [{ op: 'addPlace', place: { id: 'lighthouse', kind: 'landmark', label: 'Lighthouse', asset: 'lighthouse', size: 'medium', interaction: 'none', where: [{ rel: 'at', x: clampCore(x), z: clampCore(z) }] } }]).recipe;
}

describe('kept placements re-pad only where the solver padded them', () => {
  it.each(RECIPE_FIXTURES)('%s: rebuilding with all placements kept gives identical pads and heights', (name) => {
    expectStableRebuild(buildWorld(loadRecipeFixture(name)));
  });

  it('a warned "at" landmark in the river is not padded, and stays unpadded when kept', () => {
    const base = buildWorld(loadRecipeFixture('fishing-valley'));
    const wet = base.field.river.find((p) => Math.abs(p.x) < 400 && Math.abs(p.z) < 400 && base.field.isWater(p.x, p.z))!;
    expect(wet).toBeDefined();
    const w = buildWorld(withLighthouseAt(base.recipe, wet.x, wet.z), base.placements);
    const lh = w.placements.find((p) => p.id === 'lighthouse')!;
    expect(lh.warnings.join(' ')).toMatch(/in water/);
    expect(lh.padded).toBe(false);
    expectStableRebuild(w);
  });

  it('a warned "at" landmark overlapping the village is not padded, and stays unpadded when kept', () => {
    const base = buildWorld(loadRecipeFixture('fishing-valley'));
    const village = base.placements.find((p) => p.kind === 'settlement')!;
    const w = buildWorld(withLighthouseAt(base.recipe, village.x + 10, village.z), base.placements);
    const lh = w.placements.find((p) => p.id === 'lighthouse')!;
    expect(lh.warnings.join(' ')).toMatch(/overlapping|in water|too steep/);
    expect(lh.padded).toBe(false);
    expectStableRebuild(w);
  });

  it('undo after adding a warned landmark restores the original terrain exactly', () => {
    const base = buildWorld(loadRecipeFixture('fishing-valley'));
    const village = base.placements.find((p) => p.kind === 'settlement')!;
    buildWorld(withLighthouseAt(base.recipe, village.x, village.z), base.placements);
    const undone = buildWorld(base.recipe, base.placements);
    expect(undone.field.pads).toEqual(base.field.pads);
    expect(sample(undone.field, undone)).toEqual(sample(base.field, base));
  });
});

describe('pad order after a move', () => {
  it.each(RECIPE_FIXTURES)('%s: moving each non-prop place, then keeping everything, gives the same pad list', (name) => {
    const r = loadRecipeFixture(name);
    const base = buildWorld(r);
    for (const pl of base.placements.filter((p) => p.kind !== 'prop')) {
      const a = applyOps(r, [{ op: 'movePlace', id: pl.id, where: [{ rel: 'flat' }] }]);
      const w = buildWorld(a.recipe, base.placements.filter((p) => !a.changedPlaces.has(p.id)));
      expectStableRebuild(w);
    }
  });
});
