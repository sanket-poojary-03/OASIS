import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { partsSchema } from '../../src/api/parts';
import { buildProcedural } from '../../src/render/proceduralModel';
import { tintedCopy } from '../../src/render/tint';

const FIXTURE = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/fixtures/assets/procedural-lighthouse.json'), 'utf8'));
const box = { shape: 'box', at: [0, 0.5, 0], size: [1, 1, 1], color: '#cc2222' };

describe('procedural parts (the contract shared with the backend)', () => {
  it('accepts the shared fixture', () => {
    expect(partsSchema.safeParse(FIXTURE).success).toBe(true);
  });

  it.each([
    ['no parts', []],
    ['an unknown shape', [{ ...box, shape: 'script' }]],
    ['a colour name', [{ ...box, color: 'red' }]],
    ['a short position', [{ ...box, at: [0, 0] }]],
    ['a zero size', [{ ...box, size: [0, 1, 1] }]],
    ['an extra key', [{ ...box, code: 'x' }]],
    ['too many parts', Array(25).fill(box)],
  ])('rejects %s', (_, bad) => {
    expect(partsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('buildProcedural', () => {
  it('builds one mesh per part at its size, position and colour', () => {
    const g = buildProcedural(partsSchema.parse(FIXTURE));
    expect(g.children).toHaveLength(FIXTURE.length);
    const bounds = new THREE.Box3().setFromObject(g);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeCloseTo(10.6, 1);
    const tower = g.children[0] as THREE.Mesh;
    expect((tower.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(new THREE.Color('#f2efe6').getHexString());
  });

  it('gives a one-part cube its exact shape', () => {
    const g = buildProcedural(partsSchema.parse([box]));
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    expect([size.x, size.y, size.z]).toEqual([1, 1, 1]);
  });

  it('makes every shape', () => {
    for (const shape of ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'ring']) {
      const size = new THREE.Box3().setFromObject(buildProcedural(partsSchema.parse([{ ...box, shape }]))).getSize(new THREE.Vector3());
      expect(size.y, shape).toBeGreaterThan(0);
      expect(size.x, shape).toBeGreaterThan(0.9);
    }
  });
});

describe('tintedCopy', () => {
  const red = new THREE.Color('#cc2222');
  const model = (color: string, map?: THREE.Texture) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color, map: map ?? null })));
    return g;
  };
  const colorOf = (o: THREE.Object3D) => ((o.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color;

  it('leaves the template alone', () => {
    const template = model('#ffffff');
    tintedCopy(template, '#cc2222');
    expect(colorOf(template).getHexString()).toBe('ffffff');
  });

  it('turns a white model the colour itself', () => {
    expect(colorOf(tintedCopy(model('#ffffff'), '#cc2222')).getHex()).toBe(red.getHex());
  });

  it('keeps a light surface lighter than a dark one, and a dark one still shows the colour', () => {
    const light = colorOf(tintedCopy(model('#ffffff'), '#cc2222'));
    const dark = colorOf(tintedCopy(model('#111111'), '#cc2222'));
    expect(light.r).toBeGreaterThan(dark.r);
    expect(dark.r).toBeGreaterThan(dark.g);
    expect(dark.r).toBeGreaterThan(red.r * 0.35);
  });

  it('gives a textured model the tint to multiply with', () => {
    expect(colorOf(tintedCopy(model('#888888', new THREE.Texture()), '#cc2222')).getHex()).toBe(red.getHex());
  });

  it('recolours multi-material meshes and shares one copy per material', () => {
    const shared = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), [shared, shared]));
    const mats = (tintedCopy(g, '#cc2222').children[0] as THREE.Mesh).material as THREE.Material[];
    expect(mats[0]).toBe(mats[1]);
    expect(mats[0]).not.toBe(shared);
  });
});
