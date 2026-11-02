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
  }
  return mergeGeometries(P, false)!;
}

const SHADOW: ReadonlySet<ScatterKind> = new Set(['tree', 'pine', 'dead_tree', 'cactus']);

/** Attributes a pack model may keep when its meshes are merged (only those every mesh has). */
const KEEP = ['position', 'normal', 'uv', 'color'];

export class ScatterAssets {
  private readonly geos = new Map<ScatterKind, THREE.BufferGeometry>();
  private readonly models = new Map<ScatterKind, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }>();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private readonly dummy = new THREE.Object3D();

  private geometry(kind: ScatterKind): THREE.BufferGeometry {
    let g = this.geos.get(kind);
    if (!g) { g = build(kind); this.geos.set(kind, g); }
    return g;
  }

  hasModel(kind: ScatterKind): boolean {
    return this.models.has(kind);
  }

  /**
   * Replace a procedural kind with a pack model: merged into one geometry (one material group per mesh), fitted to
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
    this.models.set(kind, { geometry: merged, material: fixed.length === 1 ? fixed[0] : fixed });
  }

  instance(items: ScatterItem[]): THREE.Group {
    const group = new THREE.Group();
    const byKind = new Map<ScatterKind, ScatterItem[]>();
    for (const it of items) { const list = byKind.get(it.kind) ?? []; list.push(it); byKind.set(it.kind, list); }
    for (const [kind, list] of byKind) {
      const model = this.models.get(kind);
      const mesh = new THREE.InstancedMesh(model?.geometry ?? this.geometry(kind), model?.material ?? this.material, list.length);
      list.forEach((it, i) => {
        this.dummy.position.set(it.x, it.y, it.z);
        this.dummy.rotation.set(0, it.rotation, 0);
        this.dummy.scale.setScalar(it.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.castShadow = SHADOW.has(kind);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
}
