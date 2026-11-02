import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Wildlife } from '../../src/logic/wildlife';
import type { BuiltWorld } from '../../src/world/build';
import type { WorldField } from '../../src/world/field';
import { fakeTemplate } from '../render/rigFixture';

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
  it('uses animated pack models when given, hot-swaps live animals, and keeps the procedural ones otherwise', () => {
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(world);
    const before = positions(w).length;
    const deer = fakeTemplate(1.5);
    const geo = (deer.scene.children[0] as THREE.Mesh).geometry;
    let disposed = 0;
    geo.addEventListener('dispose', () => disposed++);
    w.useModel('deer', deer); // hot-swap: same animals, deer now animated
    w.update(0.1, 0, new THREE.Vector3(1e6, 0, 1e6), field);
    expect(positions(w)).toHaveLength(before);
    const animated = () => w.group.children.filter((g) => g.getObjectByName('body'));
    expect(animated().length).toBeGreaterThan(0);
    expect(animated().length).toBeLessThan(before); // rabbits stay procedural
    w.rebuild(world); // a rebuild uses the template directly and never disposes its shared geometry
    expect(animated().length).toBeGreaterThan(0);
    w.rebuild(world);
    expect(disposed).toBe(0);
    for (let i = 0; i < 50; i++) w.update(0.5, i, new THREE.Vector3(0, 0, 0), field);
    for (const m of w.group.children) expect(water(m.position.x)).toBe(false);
  });
  it('ignores a template that cannot be cloned and keeps the procedural animals (I5)', () => {
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(world);
    const before = w.group.children.slice();
    const bad = fakeTemplate(1.5);
    bad.scene.clone = () => { throw new Error('broken rig'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => w.useModel('deer', bad)).not.toThrow();
    expect(w.group.children).toEqual(before); // nothing swapped, nothing lost
    expect(() => w.rebuild(world)).not.toThrow(); // and the template was never registered
    expect(w.group.children.filter((g) => g.getObjectByName('body'))).toHaveLength(0);
    expect(w.group.children).toHaveLength(before.length);
  });
});
