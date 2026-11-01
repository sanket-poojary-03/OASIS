import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import { CHUNK_SIZE, type ChunkData } from '../world/chunkData';
import type { FieldSnapshot } from '../world/field';
import type { ScatterAssets } from './scatterAssets';

export const VIEW = 3;

interface LiveChunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  scatter: THREE.Group;
  positions: Float32Array;
  indices: Uint32Array;
  collider: Collider | null;
  stale: boolean;
}

const key = (cx: number, cz: number) => `${cx},${cz}`;

export class ChunkManager {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, LiveChunk>();
  private readonly pending = new Set<string>();
  private generation = 0;
  private readonly worker: Worker;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly scatter: ScatterAssets) {
    scene.add(this.group);
    this.worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => this.receive(e.data);
  }

  /** New world: the worker rebuilds its field; existing chunks stay visible until replaced. */
  setSnapshot(snapshot: FieldSnapshot): void {
    this.generation++;
    this.pending.clear();
    this.worker.postMessage({ type: 'init', generation: this.generation, snapshot });
    for (const c of this.chunks.values()) c.stale = true;
  }

  update(px: number, pz: number): void {
    if (this.generation === 0) return;
    const ccx = Math.floor(px / CHUNK_SIZE), ccz = Math.floor(pz / CHUNK_SIZE);
    const wanted: Array<[number, number, number]> = [];
    for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) wanted.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    wanted.sort((a, b) => a[2] - b[2]);
    let requested = 0;
    for (const [cx, cz] of wanted) {
      if (requested >= 4) break;
      const k = key(cx, cz);
      const c = this.chunks.get(k);
      if ((!c || c.stale) && !this.pending.has(k)) {
        this.pending.add(k);
        this.worker.postMessage({ type: 'chunk', generation: this.generation, cx, cz });
        requested++;
      }
    }
    for (const [k, c] of this.chunks) {
      const far = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (far > VIEW + 1) { this.drop(k); continue; }
      const near = far <= 1;
      if (near && !c.collider) c.collider = this.physics.addTerrain(c.positions, c.indices);
      if (!near && c.collider) { this.physics.removeCollider(c.collider); c.collider = null; }
    }
  }

  isReady(x: number, z: number): boolean {
    const c = this.chunks.get(key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    return !!c && !c.stale && !!c.collider;
  }

  meshes(): THREE.Object3D[] {
    return [...this.chunks.values()].map((c) => c.mesh);
  }

  private receive(msg: { type: 'chunk'; generation: number; data: ChunkData }): void {
    if (msg.generation !== this.generation) return;
    const d = msg.data;
    const k = key(d.cx, d.cz);
    this.pending.delete(k);
    const hadCollider = !!this.chunks.get(k)?.collider;
    this.drop(k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    const scatter = this.scatter.instance(d.scatter);
    this.group.add(mesh, scatter);
    const chunk: LiveChunk = { cx: d.cx, cz: d.cz, mesh, scatter, positions: d.positions, indices: d.indices, collider: null, stale: false };
    if (hadCollider) chunk.collider = this.physics.addTerrain(d.positions, d.indices);
    this.chunks.set(k, chunk);
  }

  private drop(k: string): void {
    const c = this.chunks.get(k);
    if (!c) return;
    this.group.remove(c.mesh, c.scatter);
    c.mesh.geometry.dispose();
    for (const child of c.scatter.children) (child as THREE.InstancedMesh).dispose();
    if (c.collider) this.physics.removeCollider(c.collider);
    this.chunks.delete(k);
  }
}
