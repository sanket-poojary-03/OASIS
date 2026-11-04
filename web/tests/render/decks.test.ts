import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { recipeSchema } from '../../src/core/recipe';
import { DeckSystem } from '../../src/render/decks';
import { createField } from '../../src/world/field';
import { loadRecipeFixture } from '../fixtures';

const rig = () => {
  const addFixedCylinder = vi.fn((..._a: number[]) => ({}) as never);
  const removeCollider = vi.fn();
  return { addFixedCylinder, removeCollider, decks: new DeckSystem(new THREE.Scene(), { addFixedCylinder, removeCollider }) };
};

describe('DeckSystem', () => {
  it('builds a walkable wooden deck per pad, its top at deck height, posts down to the sea bed', () => {
    const f = createField(recipeSchema.parse({ ...loadRecipeFixture('tropical-island'), terrain: { shape: 'ocean', roughness: 0.3, height: 0.3, seaLevel: 0.6 } }));
    f.addPad({ x: 10, z: 20, radius: 30, y: f.deckY! });
    f.addPad({ x: 200, z: 0, radius: 7, y: f.deckY! });
    const { decks, addFixedCylinder, removeCollider } = rig();
    decks.rebuild(f);
    expect(decks.group.children.length).toBe(2);
    expect(addFixedCylinder).toHaveBeenCalledTimes(2);
    const [x, y, z, half, r] = addFixedCylinder.mock.calls[0];
    expect([x, z, r]).toEqual([10, 20, 30]);
    expect(y + half).toBeCloseTo(f.deckY!); // the collider's top is the deck
    const box = new THREE.Box3().setFromObject(decks.group.children[0]);
    expect(box.max.y).toBeCloseTo(f.deckY!);
    expect(box.min.y).toBeLessThan(f.seaLevelY - 5);
    decks.rebuild(f); // a rebuild replaces, never stacks
    expect(removeCollider).toHaveBeenCalledTimes(2);
    expect(decks.group.children.length).toBe(2);
  });

  it('builds nothing in a world with land', () => {
    const f = createField(loadRecipeFixture('fishing-valley'));
    f.addPad({ x: 0, z: 0, radius: 30, y: 10 });
    const { decks, addFixedCylinder } = rig();
    decks.rebuild(f);
    expect(decks.group.children.length).toBe(0);
    expect(addFixedCylinder).not.toHaveBeenCalled();
  });
});
