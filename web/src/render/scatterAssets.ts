import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScatterItem, ScatterKind } from '../world/scatter';
import { fitToHeight } from './fit';

interface PartOpts { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number; rz?: number }

function part(geo: THREE.BufferGeometry, color: number, o: PartOpts = {}): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function build(kind: ScatterKind): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  switch (kind) {
    case 'tree':
      P.push(part(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), 0x6b4a2b, { y: 1.2 }));
      P.push(part(new THREE.IcosahedronGeometry(1.7, 0), 0x3f7a32, { y: 3.4 }));
      P.push(part(new THREE.IcosahedronGeometry(1.2, 0), 0x4c8a3a, { y: 4.5 }));
      break;
    case 'pine':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), 0x5a3d25, { y: 0.8 }));
      P.push(part(new THREE.ConeGeometry(1.6, 3, 7), 0x2f5a35, { y: 2.6 }));
      P.push(part(new THREE.ConeGeometry(1.2, 2.4, 7), 0x356640, { y: 4.0 }));
      P.push(part(new THREE.ConeGeometry(0.8, 1.8, 7), 0x3b7048, { y: 5.2 }));
      break;
    case 'dead_tree':
      P.push(part(new THREE.CylinderGeometry(0.12, 0.22, 3, 5), 0x5a4a3a, { y: 1.5 }));
      P.push(part(new THREE.CylinderGeometry(0.06, 0.09, 1.4, 4), 0x5a4a3a, { rz: 0.9, x: 0.45, y: 2.3 }));
      P.push(part(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 4), 0x5a4a3a, { rz: -0.8, x: -0.35, y: 2.0 }));
      break;
    case 'bush':
      P.push(part(new THREE.IcosahedronGeometry(0.9, 0), 0x4a7a34, { y: 0.5, sy: 0.7 }));
      break;
    case 'rock':
      P.push(part(new THREE.DodecahedronGeometry(0.9, 0), 0x7a756e, { y: 0.3, sy: 0.6 }));
      break;
    case 'cactus':
      P.push(part(new THREE.CylinderGeometry(0.25, 0.3, 2.6, 8), 0x3d7a3a, { y: 1.3 }));
      P.push(part(new THREE.CylinderGeometry(0.16, 0.16, 1, 6), 0x3d7a3a, { x: 0.5, y: 1.6 }));
      P.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 6), 0x3d7a3a, { x: -0.45, y: 1.1 }));
      break;
    case 'reed':
      for (const [x, z] of [[0, 0], [0.2, 0.1], [-0.15, 0.18]]) P.push(part(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 3), 0x7a8a46, { x, y: 0.8, z }));
      break;
    // Offline stand-ins for the newer kinds (with a server they wait for their pack model instead).
    case 'birch':
      P.push(part(new THREE.CylinderGeometry(0.14, 0.2, 3, 6), 0xe8e4d8, { y: 1.5 }));
      P.push(part(new THREE.IcosahedronGeometry(1.3, 0), 0x7fae4a, { y: 3.8, sy: 1.3 }));
      break;
    case 'autumn_tree':
      P.push(part(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), 0x6b4a2b, { y: 1.2 }));
      P.push(part(new THREE.IcosahedronGeometry(1.7, 0), 0xc8682a, { y: 3.4 }));
      break;
    case 'snowy_pine':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), 0x5a3d25, { y: 0.8 }));
      P.push(part(new THREE.ConeGeometry(1.6, 3.4, 7), 0xe6edf2, { y: 2.8 }));
      P.push(part(new THREE.ConeGeometry(1.0, 2.4, 7), 0xf4f7fa, { y: 4.6 }));
      break;
    case 'palm':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 6, 6), 0x8a6a45, { y: 3, rz: 0.12 }));
      for (let i = 0; i < 5; i++) P.push(part(new THREE.BoxGeometry(2.4, 0.06, 0.5), 0x4f8a3a, { x: 0.35, y: 6, rz: -0.35 }).rotateY((i / 5) * Math.PI * 2));
      break;
    case 'pebble':
      P.push(part(new THREE.DodecahedronGeometry(0.3, 0), 0x8a857c, { y: 0.1, sy: 0.5 }));
      break;
    case 'flowers':
      for (const [x, z, c] of [[0, 0, 0xe05a7a], [0.25, 0.1, 0xf2d04a], [-0.2, 0.2, 0xb07ae0]] as const) P.push(part(new THREE.ConeGeometry(0.1, 0.4, 5), c, { x, y: 0.2, z }));
      break;
    case 'fern':
      P.push(part(new THREE.ConeGeometry(0.6, 0.8, 6), 0x3f7a32, { y: 0.4 }));
      break;
    case 'mushroom':
      P.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), 0xeee6d6, { y: 0.12 }));
      P.push(part(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xc0392b, { y: 0.24 }));
      break;
    case 'log':
      P.push(part(new THREE.CylinderGeometry(0.25, 0.28, 3, 7), 0x6b4a2b, { y: 0.25, rz: Math.PI / 2 }));
      break;
    case 'stump':
      P.push(part(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 7), 0x6b4a2b, { y: 0.3 }));
      break;
  }
  return mergeGeometries(P, false)!;
}

/** Small things not worth drawing past the nearest chunks. */
const GROUND_COVER: ReadonlySet<ScatterKind> = new Set(['pebble', 'flowers', 'fern', 'mushroom', 'reed', 'stump', 'log', 'bush']);
const SHADOW: ReadonlySet<ScatterKind> = new Set(['tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'cactus']);
/**
 * Variants drawn per kind: every (kind, variant) is one draw call per chunk, and 49 chunks are live. Trees, which you
 * notice, use up to 4 models; ground cover and shrubs 2.
 */
export const drawnVariants = (kind: ScatterKind): number => (SHADOW.has(kind) ? 4 : 2);

/** Attributes a pack model may keep when its meshes are merged (only those every mesh has). */
const KEEP = ['position', 'normal', 'uv', 'color'];

export class ScatterAssets {
  private readonly geos = new Map<ScatterKind, THREE.BufferGeometry>();
  /** Every pack model a kind has (its variants); an item draws `variant % count`. */
  private readonly models = new Map<ScatterKind, Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }>>();
  /**
   * Stand-in shapes allowed: offline only. With a server a kind without its pack model yet is not drawn at all (it
   * appears when the model arrives, via ChunkManager.refreshScatter), so no placeholder trees ever show.
   */
  standIns = true;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private readonly dummy = new THREE.Object3D();

  private geometry(kind: ScatterKind): THREE.BufferGeometry {
    let g = this.geos.get(kind);
    if (!g) { g = build(kind); this.geos.set(kind, g); }
    return g;
  }

  hasModel(kind: ScatterKind): boolean {
    return (this.models.get(kind)?.length ?? 0) > 0;
  }

  /** How many pack models (variants) a kind has. */
  modelCount(kind: ScatterKind): number {
    return this.models.get(kind)?.length ?? 0;
  }

  /**
   * Add a pack model (one more variant) for a kind, replacing its procedural shape: merged into one geometry (one material group per mesh), fitted to
   * `height` with fitToHeight, standing on y = 0. Takes ownership of `object` (it is rescaled). Live chunks keep their
   * old instances until ChunkManager.refreshScatter() re-instances them. If nothing can be merged the kind stays procedural.
   */
  useModel(kind: ScatterKind, object: THREE.Object3D, height: number): void {
    fitToHeight(object, height);
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let g = o.geometry.clone() as THREE.BufferGeometry;
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(o.matrixWorld);
      g.morphAttributes = {};
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      geos.push(g);
      mats.push(Array.isArray(o.material) ? o.material[0] : o.material);
    });
    if (geos.length === 0) return;
    const keep = KEEP.filter((a) => geos.every((g) => g.getAttribute(a)));
    for (const g of geos) for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    const merged = mergeGeometries(geos, true);
    for (const g of geos) g.dispose();
    if (!merged) return;
    // A material that reads vertex colours would turn black once a mesh without them forced the attribute out.
    const fixed = mats.map((m) => {
      if (keep.includes('color') || !(m as THREE.MeshStandardMaterial).vertexColors) return m;
      const c = m.clone();
      (c as THREE.MeshStandardMaterial).vertexColors = false;
      return c;
    });
    const list = this.models.get(kind) ?? [];
    list.push({ geometry: merged, material: fixed.length === 1 ? fixed[0] : fixed });
    this.models.set(kind, list);
  }

  /**
   * `lod`: 0 for the chunks around the camera (everything, with shadows); 1 and 2 for the outer rings, which keep only
   * trees, rocks and other big things, thinned to 1 in 2 and 1 in 3, and cast no shadows. Library trees are 3-6k
   * triangles each: measured on an integrated GPU, drawing every one of ~1,500 at full detail ran a city at 1.5 fps.
   */
  instance(items: ScatterItem[], lod = 0): THREE.Group {
    const group = new THREE.Group();
    if (lod > 0) items = items.filter((it, i) => !GROUND_COVER.has(it.kind) && i % (lod + 1) === 0);
    // One instanced mesh per (kind, variant) actually used.
    const groups = new Map<string, { kind: ScatterKind; model?: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }; list: ScatterItem[] }>();
    for (const it of items) {
      const models = this.models.get(it.kind);
      if (!models?.length && !this.standIns) continue; // with a server: real model or nothing
      const v = models?.length ? (it.variant ?? 0) % Math.min(models.length, drawnVariants(it.kind)) : -1;
      const key = `${it.kind}#${v}`;
      const g = groups.get(key) ?? { kind: it.kind, model: v >= 0 ? models![v] : undefined, list: [] };
      g.list.push(it);
      groups.set(key, g);
    }
    for (const { kind, model, list } of groups.values()) {
      const mesh = new THREE.InstancedMesh(model?.geometry ?? this.geometry(kind), model?.material ?? this.material, list.length);
      list.forEach((it, i) => {
        this.dummy.position.set(it.x, it.y, it.z);
        this.dummy.rotation.set(0, it.rotation, 0);
        this.dummy.scale.setScalar(it.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.castShadow = lod === 0 && SHADOW.has(kind);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
}
