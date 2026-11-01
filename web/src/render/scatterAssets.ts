import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScatterItem, ScatterKind } from '../world/scatter';

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
    case 'grass':
      for (const [x, z] of [[0, 0], [0.15, 0.1], [-0.12, 0.12], [0.05, -0.15]]) P.push(part(new THREE.ConeGeometry(0.08, 0.6, 3), 0x5f8f3a, { x, y: 0.3, z }));
      break;
  }
  return mergeGeometries(P, false)!;
}

const SHADOW: ReadonlySet<ScatterKind> = new Set(['tree', 'pine', 'dead_tree', 'cactus']);

export class ScatterAssets {
  private readonly geos = new Map<ScatterKind, THREE.BufferGeometry>();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private readonly dummy = new THREE.Object3D();

  private geometry(kind: ScatterKind): THREE.BufferGeometry {
    let g = this.geos.get(kind);
    if (!g) { g = build(kind); this.geos.set(kind, g); }
    return g;
  }

  instance(items: ScatterItem[]): THREE.Group {
    const group = new THREE.Group();
    const byKind = new Map<ScatterKind, ScatterItem[]>();
    for (const it of items) { const list = byKind.get(it.kind) ?? []; list.push(it); byKind.set(it.kind, list); }
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(this.geometry(kind), this.material, list.length);
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
