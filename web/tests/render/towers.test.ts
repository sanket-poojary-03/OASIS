import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Physics } from '../../src/physics/physics';
import { setNightGlow } from '../../src/render/nightGlow';
import { buildTower } from '../../src/render/towers';
import { WorldObjects, type ModelSource } from '../../src/render/worldObjects';
import type { BuiltWorld } from '../../src/world/build';
import { towerSpec } from '../../src/world/towerSpec';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('buildTower', () => {
  it('is one mesh standing on the ground, inside its plot, as tall as asked (plus its roof)', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const mesh = buildTower(towerSpec(seed, 'mixed', 48, 11), seed);
      const b = new THREE.Box3().setFromObject(mesh);
      expect(b.min.y).toBeCloseTo(0, 3);
      expect(b.max.y).toBeGreaterThanOrEqual(46);
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(11.6);
      expect(Array.isArray(mesh.material)).toBe(true);
    }
  });

  it('lights its windows at night', () => {
    const mesh = buildTower(towerSpec(7, 'glass', 30, 11), 7);
    const facade = (mesh.material as THREE.MeshStandardMaterial[]).find((m) => m.name === 'tower-window')!;
    setNightGlow(1.4);
    expect(facade.emissiveIntensity).toBe(1.4);
    setNightGlow(0);
    expect(facade.emissiveIntensity).toBe(0);
  });
});

describe('WorldObjects with city towers', () => {
  it('builds generic modern members in code and asks the model finder only for the rest', async () => {
    const place = { id: 'downtown', kind: 'settlement', size: 'large', label: 'Downtown', asset: 'glass tower', interaction: 'door', where: [], layout: { pattern: 'grid' } };
    const world = {
      placements: [{ id: 'downtown', x: 0, y: 0, z: 0, rotation: 0, radius: 60, reasons: [], warnings: [] }],
      recipe: { seed: 5, places: [place] },
      buildings: [
        { id: 'downtown-house-0', placeId: 'downtown', x: 0, y: 0, z: 0, rotation: 0, kind: 'house', asset: 'glass tower', footprint: 8, interaction: 'door', height: 40, maxWidth: 11 },
        { id: 'downtown-house-1', placeId: 'downtown', x: 20, y: 0, z: 0, rotation: 0, kind: 'house', asset: 'coffee shop', footprint: 8, interaction: 'door', height: 6, maxWidth: 11 },
      ],
    } as unknown as BuiltWorld;
    const load = vi.fn(async (_asset: string) => null);
    const physics = { addFixedBox: vi.fn(() => ({})), addFixedTrimesh: vi.fn(() => ({})), removeCollider: vi.fn() } as unknown as Physics;
    const objects = new WorldObjects(new THREE.Scene(), physics, { load } as ModelSource);
    objects.standIns = false;
    objects.rebuild(world);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBe('coffee shop');
    const tower = objects.group.children[0];
    expect(tower.getObjectByName('tower')).toBeDefined();
    expect(objects.infoFor(tower)?.source).toBe('procedural');
    expect(physics.addFixedTrimesh).toHaveBeenCalledTimes(1);
  });
});

describe('widenHouse', () => {
  it('scales a slim house up evenly to a person-sized footprint, at most 2.2x', async () => {
    const { widenHouse } = await import('../../src/render/worldObjects');
    const box = (w: number) => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 5, w).translate(0, 2.5, 0))); return g; };
    const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    const slim = box(3); widenHouse(slim);
    expect(size(slim).x).toBeCloseTo(4.5); expect(size(slim).y).toBeCloseTo(7.5);
    const spike = box(1.5); widenHouse(spike);
    expect(size(spike).x).toBeCloseTo(3.3); // capped at 2.2x
    const wide = box(8); widenHouse(wide);
    expect(size(wide).x).toBeCloseTo(8);
    expect(new THREE.Box3().setFromObject(slim).min.y).toBeCloseTo(0); // still standing on the ground
  });
});
