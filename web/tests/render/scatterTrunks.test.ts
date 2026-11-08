import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ScatterAssets } from '../../src/render/scatterAssets';
import type { ItemKind, ScatterItem } from '../../src/world/scatter';

const item = (kind: ItemKind, variant = 0): ScatterItem => ({ kind, x: 0, y: 0, z: 0, rotation: 0, scale: 1, variant });

/** A tree whose canopy leans 3 m to +x of its trunk, as a real model's often does. */
function leaningTree(trunkRadius: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(trunkRadius, trunkRadius, 4, 10).translate(0, 2, 0)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8).translate(3, 6, 0)));
  return g;
}

describe('ScatterAssets trunks', () => {
  it("measures a loaded model's real trunk, which fitting moved off its middle", () => {
    const s = new ScatterAssets();
    s.useModel('birch', leaningTree(0.3), 9);
    const t = s.trunkShape(item('birch'), 9)!;
    // Fitting centres the model's whole box (x from -0.3 to 6), so the trunk lands about 2.85 m to -x.
    expect(t.x).toBeLessThan(-2.5);
    expect(Math.abs(t.z)).toBeLessThan(0.1);
    expect(t.radius).toBeGreaterThan(0.2);
    expect(t.radius).toBeLessThan(0.45);
  });

  it('follows the variant each tree is drawn with', () => {
    const s = new ScatterAssets();
    s.useModel('pine', leaningTree(0.2), 9);
    s.useModel('pine', leaningTree(0.6), 9);
    const radii = [0, 1].map((v) => s.trunkShape(item('pine', v), 9)!.radius).sort();
    expect(radii[1] - radii[0]).toBeGreaterThan(0.25);
  });

  it("a named tree drawn with its fallback's models gets the fallback's trunk", () => {
    const s = new ScatterAssets();
    s.useModel('tree', leaningTree(0.3), 9);
    s.useFallback('canopy:ghost oak', 'tree');
    expect(s.trunkShape(item('canopy:ghost oak'), 9)!.x).toBeLessThan(-2.5);
  });

  it('nothing for a tree that is not drawn (with a server, no model means no tree); a stand-in is in its middle', () => {
    const s = new ScatterAssets();
    s.standIns = false;
    expect(s.trunkShape(item('palm'), 9)).toBeNull();
    s.standIns = true;
    expect(s.trunkShape(item('palm'), 9)).toEqual(expect.objectContaining({ x: 0, z: 0 }));
  });
});
