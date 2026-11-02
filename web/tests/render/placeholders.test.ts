import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPlaceholder, placeholderKind } from '../../src/render/placeholders';
import { fitWidth } from '../../src/render/worldObjects';

describe('placeholderKind', () => {
  it.each([
    ['white stone lighthouse', 'lighthouse'],
    ['stone castle with towers', 'castle'],
    ['ruined stone watchtower', 'tower'],
    ['wooden fishing cottage', 'house'],
    ['thatched beach hut', 'house'],
    ['wooden log cabin', 'house'],
    ['campfire with stones', 'campfire'],
    ['bronze bell on wooden post', 'bell'],
    ['iron lantern on post', 'lantern'],
    ['desert tent', 'tent'],
    ['weathered stone obelisk', 'obelisk'],
    ['stone well', 'well'],
    ['market stall', 'stall'],
    ['wooden barrel', 'barrel'],
    ['modern apartment block', 'block'],
    ['glass skyscraper', 'block'],
    ['office building', 'block'],
    ['something unusual', 'generic'],
  ])('%s → %s', (asset, kind) => {
    expect(placeholderKind(asset)).toBe(kind);
  });
});

describe('tall placeholders', () => {
  const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

  it('a block is built at the asked height, keeping a plot-sized footprint', () => {
    for (const h of [8, 40]) {
      const s = size(buildPlaceholder('modern apartment block', h));
      expect(s.y).toBeCloseTo(h, 0);
      expect(Math.max(s.x, s.z)).toBeLessThanOrEqual(10);
    }
  });

  it('has lit-window parts and only a handful of meshes', () => {
    let meshes = 0;
    buildPlaceholder('office tower block', 30).traverse((o) => { if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(12);
  });
});

describe('fitWidth', () => {
  it('shrinks a model wider than its plot, keeping proportions; leaves narrow ones alone', () => {
    const wide = new THREE.Group();
    wide.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 10)));
    fitWidth(wide, 10);
    const s = new THREE.Box3().setFromObject(wide).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(10, 5);
    expect(s.y).toBeCloseTo(10, 5);
    const narrow = new THREE.Group();
    narrow.add(new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4)));
    fitWidth(narrow, 10);
    expect(new THREE.Box3().setFromObject(narrow).getSize(new THREE.Vector3()).y).toBeCloseTo(30, 5);
  });
});

describe('fitWidth keeping height (tall group members)', () => {
  const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  it('narrows a wide model to its plot but keeps the asked height, up to a 3x stretch', () => {
    const tower = new THREE.Group();
    tower.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30)));
    fitWidth(tower, 11, true);
    expect(size(tower).x).toBeCloseTo(11, 5);
    expect(size(tower).y).toBeCloseTo(30, 5);
    const slab = new THREE.Group();
    slab.add(new THREE.Mesh(new THREE.BoxGeometry(60, 30, 60)));
    fitWidth(slab, 10, true);
    expect(size(slab).y).toBeCloseTo(30 * (10 / 60) * 3, 5); // stretch capped at 3x
  });
});
