import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps, describeOps, opsSchema } from '../../src/core/ops';
import { recipeSchema } from '../../src/core/recipe';
import { Wildlife } from '../../src/logic/wildlife';
import type { BuiltWorld } from '../../src/world/build';
import { loadOpsFixture, loadRecipeFixture } from '../fixtures';

const field = { heightAt: () => 5, isWater: () => false, slopeAt: () => 0, isReserved: () => false, waterSurfaceAt: () => null };
const worldWith = (life: unknown[]) => ({ recipe: { seed: 7, life }, field, placements: [], spawn: { x: 0, y: 5, z: 0 } }) as unknown as BuiltWorld;

function fakeModels() {
  const asked: string[] = [];
  const object = new THREE.Group();
  object.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  return { asked, load: async (asset: string) => { asked.push(asset); return { object, source: 'online' as const }; } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('any animal', () => {
  it('asks the model finder for that animal, at the height the AI gave', async () => {
    const w = new Wildlife(new THREE.Scene());
    const models = fakeModels();
    w.models = models;
    w.rebuild(worldWith([{ kind: 'animal', asset: 'giraffe', height: 5, count: 2, at: { x: 40, z: -30 } }]));
    await settle();
    expect(models.asked).toEqual(['giraffe']); // one lookup for the two of them
    expect(w.group.children).toHaveLength(2);
    for (const a of w.group.children) {
      const size = new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
      expect(size.y).toBeCloseTo(5, 3);
    }
  });

  it('stands where it was asked for, not around the start', () => {
    const w = new Wildlife(new THREE.Scene());
    w.models = fakeModels();
    w.rebuild(worldWith([{ kind: 'animal', asset: 'giraffe', height: 5, count: 3, at: { x: 40, z: -30 } }]));
    w.update(0.01, 0, new THREE.Vector3(1000, 0, 1000), field as never);
    for (const a of w.group.children) expect(Math.hypot(a.position.x - 40, a.position.z + 30)).toBeLessThan(10);
  });

  it('does not run from the player who just asked for it', () => {
    const w = new Wildlife(new THREE.Scene());
    w.models = fakeModels();
    w.rebuild(worldWith([{ kind: 'animal', asset: 'giraffe', height: 5, count: 1, at: { x: 0, z: 0 } }]));
    const a = w.group.children[0];
    w.update(0.01, 0, new THREE.Vector3(0, 0, 0), field as never);
    const x = a.position.x, z = a.position.z;
    for (let i = 0; i < 5; i++) w.update(0.05, i, new THREE.Vector3(x, 0, z), field as never);
    expect(Math.hypot(a.position.x - x, a.position.z - z)).toBeLessThan(1);
  });

  it('a late model does not land in the next world', async () => {
    const w = new Wildlife(new THREE.Scene());
    w.models = fakeModels();
    w.rebuild(worldWith([{ kind: 'animal', asset: 'giraffe', height: 5, count: 1 }]));
    w.rebuild(worldWith([]));
    await settle();
    expect(w.group.children).toHaveLength(0);
  });

  it('never disposes the model every copy shares', async () => {
    const w = new Wildlife(new THREE.Scene());
    const models = fakeModels();
    w.models = models;
    const geometry = ((await models.load('x')).object.children[0] as THREE.Mesh).geometry;
    let disposed = false;
    geometry.addEventListener('dispose', () => { disposed = true; });
    w.rebuild(worldWith([{ kind: 'animal', asset: 'giraffe', height: 5, count: 1 }]));
    await settle();
    w.rebuild(worldWith([]));
    expect(disposed).toBe(false);
  });

  it('the built-in animals still work with no finder', () => {
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(worldWith([{ kind: 'deer', count: 2 }, { kind: 'birds', count: 1 }]));
    expect(w.group.children).toHaveLength(3);
  });
});

describe('the animal in the schema', () => {
  it('an edit carries it through, and says what it is', () => {
    const ops = opsSchema.parse(loadOpsFixture('add-giraffe'));
    const a = applyOps(loadRecipeFixture('fishing-valley'), ops);
    expect(a.recipe.life.at(-1)).toMatchObject({ kind: 'animal', asset: 'giraffe', height: 5, count: 1, at: { x: 12, z: -8 } });
    expect(describeOps(ops)[0]).toMatch(/giraffe/);
    expect(describeOps(ops)[0]).not.toMatch(/animal/);
  });

  it('an animal must say which', () => {
    const r = loadRecipeFixture('fishing-valley');
    expect(recipeSchema.safeParse({ ...r, life: [{ kind: 'animal', count: 1 }] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...r, life: [{ kind: 'animal', asset: 'horse', count: 1 }] }).success).toBe(true);
    expect(recipeSchema.safeParse({ ...r, life: [{ kind: 'animal', asset: 'horse', count: 1, height: 99 }] }).success).toBe(false);
  });
});
