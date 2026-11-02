import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Wildlife } from '../../src/logic/wildlife';
import type { BuiltWorld } from '../../src/world/build';
import type { WorldField } from '../../src/world/field';

const water = (x: number) => x > 40 && x < 60;
const field = {
  heightAt: () => 5,
  slopeAt: (x: number) => (x < -100 ? 0.9 : 0.1),
  isWater: (x: number) => water(x),
  isReserved: () => false,
} as unknown as WorldField;
const world = { recipe: { seed: 7, life: [{ kind: 'deer', count: 8 }, { kind: 'rabbits', count: 8 }] }, field, placements: [], spawn: { x: 0, y: 5, z: 0 } } as unknown as BuiltWorld;
const positions = (w: Wildlife) => w.group.children.map((m) => `${m.position.x},${m.position.z}`);

describe('Wildlife', () => {
  it('spawns only on dry, gentle ground, deterministically', () => {
    const w1 = new Wildlife(new THREE.Scene()), w2 = new Wildlife(new THREE.Scene());
    w1.update(0.1, 0, new THREE.Vector3(1e6, 0, 1e6), field);
    w1.rebuild(world); w2.rebuild(world);
    w1.update(0, 0, new THREE.Vector3(1e6, 0, 1e6), field);
    w2.update(0, 0, new THREE.Vector3(1e6, 0, 1e6), field);
    expect(positions(w1)).toEqual(positions(w2));
    for (const m of w1.group.children) { expect(water(m.position.x)).toBe(false); expect(m.position.x).toBeGreaterThan(-100); }
  });
  it('never walks into water or unloaded terrain, and hides there', () => {
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(world);
    const ready = (x: number) => x < 200;
    for (let i = 0; i < 400; i++) w.update(1, i, new THREE.Vector3(0, 0, 0), field, ready);
    for (const m of w.group.children) { expect(water(m.position.x)).toBe(false); expect(m.visible).toBe(ready(m.position.x)); }
  });
});
