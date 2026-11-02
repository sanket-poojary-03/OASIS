import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addNightGlow, setNightGlow } from '../../src/render/nightGlow';
import { WINDOW_MATERIAL } from '../../src/render/placeholders';
import { normalizeTo } from '../../src/render/worldObjects';

/** A house model with no window materials: a 6 x 4 x 5 body on a wider 8 x 0.2 x 8 porch slab (so walls are not the bounding box). */
function plainHouse(): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ name: 'LightWood' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), wall);
  body.position.y = 2.2;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), wall);
  slab.position.y = 0.1;
  g.add(body, slab);
  return g;
}

/** A model whose windows are their own material, as in the packs and many online models. */
function glazedHouse(glass: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), new THREE.MeshStandardMaterial({ name: 'Plaster' })));
  const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), glass);
  win.position.set(0, 0, 2.55);
  g.add(win);
  return g;
}

const panes = (o: THREE.Object3D) => o.children.filter((c) => c.name === 'night-window') as THREE.Mesh[];

describe('night glow for loaded models (I3)', () => {
  it('adds window panes on the real front and back walls of a model without window materials', () => {
    const content = normalizeTo(plainHouse(), 4.2); // the model is 4.2 m tall: fitted at its own scale
    expect(addNightGlow(content, 'wooden fishing cottage')).toBe(4);
    const added = panes(content);
    expect(added).toHaveLength(4);
    for (const p of added) {
      expect(p.material).toBe(WINDOW_MATERIAL);
      expect(Math.abs(p.position.z)).toBeCloseTo(2.54, 2); // on the 5 m deep body, not on the 8 m porch
      expect(p.position.y).toBeCloseTo(0.34 * 4.2, 4);
    }
    expect(added.filter((p) => p.position.z > 0)).toHaveLength(2);
    setNightGlow(1.4);
    expect(WINDOW_MATERIAL.emissiveIntensity).toBe(1.4);
    setNightGlow(0);
    expect(WINDOW_MATERIAL.emissiveIntensity).toBe(0);
  });

  it('lights window/lamp materials by name with one shared lit copy, leaving the source material untouched', () => {
    const glass = new THREE.MeshStandardMaterial({ name: 'Window_Glass', color: 0x335577 });
    const a = normalizeTo(glazedHouse(glass), 6), b = normalizeTo(glazedHouse(glass), 6);
    expect(addNightGlow(a, 'stone house')).toBe(1);
    expect(addNightGlow(b, 'stone house')).toBe(1);
    expect(panes(a)).toHaveLength(0); // it has real windows: no extra panes
    const litA = (a.children[0].children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const litB = (b.children[0].children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(litA).not.toBe(glass);
    expect(litB).toBe(litA);
    expect(litA.color.getHex()).toBe(0x335577);
    expect(((a.children[0].children[0] as THREE.Mesh).material as THREE.Material).name).toBe('Plaster');
    setNightGlow(1.4);
    expect(litA.emissiveIntensity).toBe(1.4);
    expect(litA.emissive.getHex()).toBe(WINDOW_MATERIAL.emissive.getHex());
    expect(glass.emissive.getHex()).toBe(0);
    setNightGlow(0);
    expect(litA.emissiveIntensity).toBe(0);
  });

  it('leaves models of things without lights alone', () => {
    const content = normalizeTo(plainHouse(), 6);
    expect(addNightGlow(content, 'wooden barrel')).toBe(0);
    expect(addNightGlow(content, 'stone well')).toBe(0);
    expect(panes(content)).toHaveLength(0);
  });
});
