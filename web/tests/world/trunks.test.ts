import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { isTreeKind, scatterChunk, type ItemKind, type ScatterItem } from '../../src/world/scatter';
import { trunkColliders } from '../../src/world/trunks';
import { loadRecipeFixture } from '../fixtures';

const item = (kind: ItemKind, scale = 1): ScatterItem => ({ kind, x: 10, y: 5, z: -20, rotation: 0, scale, variant: 0 });

describe('trunk colliders', () => {
  it('every tree kind is solid, preset or named canopy; ground cover, logs, stumps and named shrubs are not', () => {
    for (const k of ['tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'canopy:twisted spooky tree'] as ItemKind[]) {
      expect(isTreeKind(k)).toBe(true);
    }
    for (const k of ['bush', 'flowers', 'fern', 'log', 'stump', 'rock', 'reed', 'shrub:lavender', 'ground:moss'] as ItemKind[]) {
      expect(isTreeKind(k)).toBe(false);
    }
    const items = [item('pine'), item('fern'), item('canopy:willow'), item('stump')];
    expect(trunkColliders(items, () => 7).map((t) => t.x)).toHaveLength(2);
  });

  it('stands on the ground at the tree, taller than the player, its foot buried', () => {
    const [t] = trunkColliders([item('tree')], () => 6);
    expect(t.x).toBe(10);
    expect(t.z).toBe(-20);
    expect(t.y - t.halfHeight).toBeLessThan(5);
    expect(t.y + t.halfHeight).toBeGreaterThan(5 + 2);
    expect(t.radius).toBeCloseTo(0.3);
  });

  it('grows with the tree: its drawn height and its scale, within sane bounds', () => {
    const small = trunkColliders([item('tree', 0.75)], () => 6)[0], big = trunkColliders([item('tree', 1.35)], () => 6)[0];
    expect(big.radius).toBeGreaterThan(small.radius);
    expect(big.halfHeight).toBeGreaterThan(small.halfHeight);
    const giant = trunkColliders([item('canopy:sequoia')], () => 30)[0], sapling = trunkColliders([item('canopy:sapling')], () => 1)[0];
    expect(giant.radius).toBeLessThanOrEqual(0.9);
    expect(sapling.radius).toBeGreaterThanOrEqual(0.2);
  });

  it('skips trees that are not drawn, so nothing invisible blocks the way', () => {
    expect(trunkColliders([item('palm'), item('pine')], () => 8, (it) => (it.kind === 'pine' ? { x: 0, z: 0, radius: 0.3 } : null))).toHaveLength(1);
  });

  it("stands where the model's own trunk is: off its middle, turned and scaled with the tree", () => {
    // A birch's trunk is 1.1 m from its middle (its canopy leans): a cylinder in the middle stood in the air beside it.
    const shape = { x: 0, z: 1, radius: 0.25 };
    const plain = trunkColliders([item('birch')], () => 7, () => shape)[0];
    expect(plain.x).toBeCloseTo(10);
    expect(plain.z).toBeCloseTo(-19);
    expect(plain.radius).toBeCloseTo(0.25);
    const turned = { ...item('birch', 2), rotation: Math.PI / 2 }; // three's Y turn takes +z to +x
    const t = trunkColliders([turned], () => 7, () => shape)[0];
    expect(t.x).toBeCloseTo(12);
    expect(t.z).toBeCloseTo(-20);
    expect(t.radius).toBeCloseTo(0.5);
  });

  it('a model with a hair-thin trunk still gets a trunk you bump into', () => {
    expect(trunkColliders([item('tree')], () => 6, () => ({ x: 0, z: 0, radius: 0.02 }))[0].radius).toBeGreaterThanOrEqual(0.15);
  });

  it('a wooded chunk gets a trunk for each of its trees, the same every time', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    let trees = 0, trunks = 0;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const items = scatterChunk(field, x, z);
      trees += items.filter((i) => isTreeKind(i.kind)).length;
      const a = trunkColliders(items, () => 6);
      expect(a).toEqual(trunkColliders(items, () => 6));
      trunks += a.length;
    }
    expect(trees).toBeGreaterThan(20);
    expect(trunks).toBe(trees);
  });
});
