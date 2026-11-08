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
  waterSurfaceAt: (x: number) => (water(x) ? 6 : null),
} as unknown as WorldField;
const world = { recipe: { seed: 7, life: [{ kind: 'deer', count: 8 }, { kind: 'rabbits', count: 8 }] }, field, placements: [], spawn: { x: 0, y: 5, z: 0 } } as unknown as BuiltWorld;
/** Near half-turns that come within a second of the last one: the flicker of an animal turning back and forth. */
function rapidTurns(w: Wildlife, body: THREE.Object3D, f: WorldField, dt: number, frames: number, each?: () => void): number {
  let rapid = 0, last = body.rotation.y, lastTurn = -Infinity;
  for (let i = 0; i < frames; i++) {
    w.update(dt, i * dt, new THREE.Vector3(1e6, 0, 1e6), f);
    each?.();
    const turn = Math.abs(Math.atan2(Math.sin(body.rotation.y - last), Math.cos(body.rotation.y - last)));
    last = body.rotation.y;
    if (turn < 2.5) continue;
    if (i * dt - lastTurn < 1) rapid++;
    lastTurn = i * dt;
  }
  return rapid;
}
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
  it('an animal asked for at a spot stands right there, whatever the ground: on water it floats on the surface', () => {
    const asked = { ...world, recipe: { seed: 7, life: [
      { kind: 'animal', asset: 'dragon', count: 1, at: { x: 50, z: 0 } }, // a lake
      { kind: 'animal', asset: 'goat', count: 3, at: { x: -150, z: 0 } }, // a cliff
    ] } } as unknown as BuiltWorld;
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(asked);
    w.update(0, 0, new THREE.Vector3(1e6, 0, 1e6), field);
    const [dragon, ...goats] = w.group.children;
    expect(w.group.children).toHaveLength(4);
    expect([dragon.position.x, dragon.position.z, dragon.position.y]).toEqual([50, 0, 6]);
    for (const g of goats) expect(Math.hypot(g.position.x + 150, g.position.z)).toBeLessThanOrEqual(8);
  });
  it('tells where each life entry was put, for the edit report (none for herds that found no room)', () => {
    const cliff = { ...field, slopeAt: () => 0.9 } as unknown as WorldField;
    const asked = { ...world, field: cliff, recipe: { seed: 7, life: [
      { kind: 'deer', count: 2 }, // no gentle ground anywhere: none
      { kind: 'animal', asset: 'dragon', count: 1, at: { x: 30, z: 4 } },
      { kind: 'birds', count: 3 },
    ] } } as unknown as BuiltWorld;
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(asked);
    expect(w.spotsOf(0)).toEqual([]);
    expect(w.spotsOf(1)).toEqual([{ x: 30, z: 4 }]);
    expect(w.spotsOf(2)).toHaveLength(1); // the flock's centre
    expect(w.spotsOf(9)).toEqual([]);
  });
  it('an animal dropped where it may not walk (a lake here) neither spins on the spot nor stays stuck: it walks out', () => {
    const asked = { ...world, recipe: { seed: 7, life: [{ kind: 'animal', asset: 'dragon', count: 1, at: { x: 50, z: 0 } }] } } as unknown as BuiltWorld;
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(asked);
    const dragon = w.group.children[0];
    const flicker = rapidTurns(w, dragon, field, 0.1, 3000); // 300 s
    expect(flicker).toBe(0);
    expect(water(dragon.position.x)).toBe(false);
  });
  it('an animal that meets a wall never walks through it, and turns away without flickering', () => {
    const wall = { ...field, isReserved: (x: number) => x > 12 } as unknown as WorldField;
    const herd = { ...world, field: wall, recipe: { seed: 3, life: [{ kind: 'animal', asset: 'goat', count: 1, at: { x: 11.5, z: 0 } }] } } as unknown as BuiltWorld;
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(herd);
    const goat = w.group.children[0];
    expect(rapidTurns(w, goat, wall, 0.05, 2000, () => expect(goat.position.x).toBeLessThanOrEqual(12))).toBe(0);
  });
  it('never walks into water or unloaded terrain, and hides there', () => {
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(world);
    const ready = (x: number) => x < 200;
    for (let i = 0; i < 400; i++) w.update(1, i, new THREE.Vector3(0, 0, 0), field, ready);
    for (const m of w.group.children) { expect(water(m.position.x)).toBe(false); expect(m.visible).toBe(ready(m.position.x)); }
  });
  it('walks around houses and off roads, and keeps near its herd', () => {
    const house = (x: number, z: number) => Math.hypot(x - 20, z) < 6;
    const built = { ...field, isReserved: (x: number, z: number, margin: number) => Math.hypot(x - 20, z) < 6 + margin } as unknown as WorldField;
    const herd = { ...world, field: built, recipe: { seed: 7, life: [{ kind: 'animal', asset: 'sheep', count: 6, at: { x: 5, z: 0 } }] } } as unknown as BuiltWorld;
    const w = new Wildlife(new THREE.Scene());
    w.rebuild(herd);
    for (let i = 0; i < 3000; i++) {
      w.update(0.1, i, new THREE.Vector3(1e6, 0, 1e6), built);
      for (const m of w.group.children) {
        expect(house(m.position.x, m.position.z)).toBe(false);
        expect(Math.hypot(m.position.x - 5, m.position.z)).toBeLessThan(30);
      }
    }
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try { expect(() => w.useModel('deer', bad)).not.toThrow(); } finally { warn.mockRestore(); }
    expect(w.group.children).toEqual(before); // nothing swapped, nothing lost
    expect(() => w.rebuild(world)).not.toThrow(); // and the template was never registered
    expect(w.group.children.filter((g) => g.getObjectByName('body'))).toHaveLength(0);
    expect(w.group.children).toHaveLength(before.length);
  });
});
