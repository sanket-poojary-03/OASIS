import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { Physics } from '../physics/physics';
import type { WorldField } from '../world/field';

/**
 * The wooden decks of an ocean world. The terrain mesh stays on the sea bed everywhere (raising it for a deck drew a
 * sand cliff, which read as land); each pad is a structure of its own: a plank top, a dark edge, and posts down into
 * the water, with a cylinder collider to walk on.
 */
const THICKNESS = 0.6;
const POST_RADIUS = 0.22;
const POST_SPACING = 9;
/** One plank-texture tile covers this many metres. */
const TILE = 6;
const PLANKS = 8;
const SIZE = 64;

function plankTexture(): THREE.DataTexture {
  const rng = mulberry32(0x0dec4);
  const shade = Array.from({ length: PLANKS }, () => 0.82 + rng() * 0.3);
  const data = new Uint8Array(SIZE * SIZE * 4);
  const row = SIZE / PLANKS;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const plank = Math.floor(y / row);
    const gap = y % row === 0 || (x + plank * 23) % SIZE === 0;
    const grain = 1 + 0.05 * Math.sin((x + plank * 11) * 0.7 + plank);
    const k = gap ? 0.35 : shade[plank] * grain;
    data.set([Math.min(255, 150 * k), Math.min(255, 104 * k), Math.min(255, 62 * k), 255], (y * SIZE + x) * 4);
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Also used by the boardwalks and streets of an ocean world (render/roads). */
export const WOOD_COLOUR = 0x8f6a42;
let top: THREE.MeshStandardMaterial | null = null;
const topMaterial = (): THREE.MeshStandardMaterial => (top ??= new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 }));
/** Posts and rails: also a bridge's (render/roads). */
export const under = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1, flatShading: true });

function deckGeometry(field: WorldField, x: number, z: number, radius: number, y: number): THREE.BufferGeometry {
  const segments = Math.max(16, Math.min(64, Math.round(radius * 2)));
  const plate = new THREE.CircleGeometry(radius, segments).rotateX(-Math.PI / 2);
  // Planks run the same way across the world, whatever the deck's size.
  const pos = plate.getAttribute('position'), uv = plate.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / TILE, (pos.getZ(i) + z) / TILE);
  plate.translate(x, y, z);
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(radius, radius, THICKNESS, segments, 1, true).translate(x, y - THICKNESS / 2, z)];
  for (const ring of radius > 24 ? [radius - 0.8, radius * 0.55] : [radius - 0.8]) {
    const n = Math.max(4, Math.round((2 * Math.PI * ring) / POST_SPACING));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
      const bed = field.meshHeightAt(px, pz);
      parts.push(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, y - bed, 6).translate(px, (y + bed) / 2, pz));
    }
  }
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  const below = mergeGeometries(parts.map(flat))!;
  const merged = mergeGeometries([flat(plate), below], true)!;
  plate.dispose(); below.dispose();
  for (const p of parts) p.dispose();
  return merged;
}

export class DeckSystem {
  readonly group = new THREE.Group();
  private colliders: Collider[] = [];

  constructor(scene: THREE.Scene, private readonly physics: Pick<Physics, 'addFixedCylinder' | 'removeCollider'>) {
    scene.add(this.group);
  }

  /** One deck per pad of an ocean world; every other world has none. Call after the whole world is built. */
  rebuild(field: WorldField): void {
    for (const c of this.colliders) this.physics.removeCollider(c);
    this.colliders = [];
    for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose();
    this.group.clear();
    if (field.deckY === null) return;
    for (const p of field.pads) {
      const mesh = new THREE.Mesh(deckGeometry(field, p.x, p.z, p.radius, field.deckY), [topMaterial(), under]);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.colliders.push(this.physics.addFixedCylinder(p.x, field.deckY - THICKNESS / 2, p.z, THICKNESS / 2, p.radius));
    }
  }
}
