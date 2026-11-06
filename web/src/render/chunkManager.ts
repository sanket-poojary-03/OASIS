import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import { CHUNK_SIZE, type ChunkData } from '../world/chunkData';
import { chunkInMap } from '../world/mapBounds';
import type { FieldSnapshot } from '../world/field';
import type { ScatterItem } from '../world/scatter';
import { ChunkQueue } from './chunkQueue';
import type { GrassSystem } from './grass';
import type { ScatterAssets } from './scatterAssets';

import { pickColliderBuilds } from './colliderBudget';
import { VIEW_RADIUS } from './deviceTier';
import { addShoreFoam } from './shoreFoam';

export const VIEW = VIEW_RADIUS;

interface LiveChunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  scatter: THREE.Group;
  /** Scatter detail it was instanced at (0 near the camera). */
  lod: number;
  /** Kept so the scatter can be re-instanced when pack models arrive (art hot-swap). */
  items: ScatterItem[];
  grassData: Float32Array;
  /** Built only on the 3×3 chunks around the player; disposed when it leaves that ring or the chunk drops. */
  grass: THREE.InstancedMesh | null;
  positions: Float32Array;
  indices: Uint32Array;
  collider: Collider | null;
  stale: boolean;
}

const key = (cx: number, cz: number) => `${cx},${cz}`;

export class ChunkManager {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, LiveChunk>();
  private readonly queue = new ChunkQueue();
  private generation = 0;
  /** The camera's chunk at the last update (scatter detail rings are around it). */
  private ccx = 0;
  private ccz = 0;
  private readonly worker: Worker;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly scatter: ScatterAssets, private readonly grass: GrassSystem) {
    scene.add(this.group);
    addShoreFoam(this.material);
    this.worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => {
      try { this.receive(e.data); } catch (err) { console.warn('[chunks] bad worker message', err); this.queue.failAll(performance.now()); }
    };
    this.worker.onerror = (e) => { console.warn('[chunks] worker error', e.message); this.queue.failAll(performance.now()); };
    this.worker.onmessageerror = (e) => { console.warn('[chunks] worker message error', e); this.queue.failAll(performance.now()); };
  }

  /** New world: the worker rebuilds its field; existing chunks stay visible until replaced. */
  setSnapshot(snapshot: FieldSnapshot): void {
    this.generation++;
    this.queue.reset();
    this.worker.postMessage({ type: 'init', generation: this.generation, snapshot });
    for (const c of this.chunks.values()) c.stale = true;
  }

  update(px: number, pz: number): void {
    if (this.generation === 0) return;
    const ccx = Math.floor(px / CHUNK_SIZE), ccz = Math.floor(pz / CHUNK_SIZE);
    this.ccx = ccx; this.ccz = ccz;
    const wanted: Array<[number, number, number]> = [];
    for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) if (chunkInMap(ccx + dx, ccz + dz)) wanted.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    wanted.sort((a, b) => a[2] - b[2]);
    const inView = new Set(wanted.map(([cx, cz]) => key(cx, cz)));
    this.queue.forgetExcept(inView);
    const now = performance.now();
    let requested = 0;
    for (const [cx, cz] of wanted) {
      if (requested >= 4) break;
      const k = key(cx, cz);
      const c = this.chunks.get(k);
      if ((!c || c.stale) && this.queue.canRequest(k, now)) {
        this.queue.markPending(k);
        this.worker.postMessage({ type: 'chunk', generation: this.generation, cx, cz });
        requested++;
      }
    }
    const needCollider: Array<{ key: string; dist: number }> = [];
    let relod = 0;
    for (const [k, c] of this.chunks) {
      const far = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (far > VIEW + 1) { this.drop(k); continue; }
      const near = far <= 1;
      if (near && !c.collider) needCollider.push({ key: k, dist: (c.cx - ccx) ** 2 + (c.cz - ccz) ** 2 });
      if (!near && c.collider) { this.physics.removeCollider(c.collider); c.collider = null; }
      if (near && !c.grass && c.grassData.length) { c.grass = this.grass.build(c.grassData); this.group.add(c.grass); }
      if (!near && c.grass) this.dropGrass(c);
      const lod = this.lodAt(c.cx, c.cz);
      if (lod !== c.lod && relod < 2) { this.reinstance(c, lod); relod++; } // a couple per frame: no hitch crossing a chunk edge
    }
    // Bounded per frame, nearest (the player's chunk) first; the rest wait for later frames.
    for (const k of pickColliderBuilds(needCollider)) {
      const c = this.chunks.get(k)!;
      c.collider = this.physics.addTerrain(c.positions, c.indices);
    }
  }

  isReady(x: number, z: number): boolean {
    const c = this.chunks.get(key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    return !!c && !c.stale && !!c.collider;
  }

  /** True when the chunk under (x, z) failed every retry, so isReady there will not come true for this world. */
  failed(x: number, z: number): boolean {
    return this.queue.gaveUp(key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  }

  meshes(): THREE.Object3D[] {
    return [...this.chunks.values()].map((c) => c.mesh);
  }

  /** Pack models arrived (art hot-swap): re-instance the scatter of every live chunk with the current ScatterAssets. */
  refreshScatter(): void {
    for (const c of this.chunks.values()) this.reinstance(c, c.lod);
  }

  /** Scatter detail by ring around the camera's chunk: 0 near, 1 and 2 further out (see ScatterAssets.instance). */
  private lodAt(cx: number, cz: number): number {
    const far = Math.max(Math.abs(cx - this.ccx), Math.abs(cz - this.ccz));
    return far <= 1 ? 0 : far === 2 ? 1 : 2;
  }

  private reinstance(c: LiveChunk, lod: number): void {
    const next = this.scatter.instance(c.items, lod);
    c.lod = lod;
    this.group.remove(c.scatter);
    for (const child of c.scatter.children) (child as THREE.InstancedMesh).dispose();
    c.scatter = next;
    this.group.add(next);
  }

  private receive(msg: { type: 'chunk'; generation: number; data: ChunkData } | { type: 'error'; generation: number; cx?: number; cz?: number; message: string }): void {
    if (msg.generation !== this.generation) return;
    if (msg.type === 'error') {
      console.warn('[chunks] worker failed', msg.cx ?? 'init', msg.cz ?? '', msg.message);
      if (msg.cx !== undefined && msg.cz !== undefined) this.queue.fail(key(msg.cx, msg.cz), performance.now());
      else this.queue.failAll(performance.now());
      return;
    }
    const d = msg.data;
    if (!d || typeof d.cx !== 'number' || typeof d.cz !== 'number'
      || !(d.positions instanceof Float32Array) || !(d.normals instanceof Float32Array) || !(d.colors instanceof Float32Array)
      || !(d.indices instanceof Uint32Array) || !Array.isArray(d.scatter) || !(d.grass instanceof Float32Array)) {
      throw new Error('malformed chunk data');
    }
    const k = key(d.cx, d.cz);
    // Build everything that can fail before touching queue or chunk state.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    const lod = this.lodAt(d.cx, d.cz);
    const scatter = this.scatter.instance(d.scatter, lod);
    this.queue.succeed(k);
    const old = this.chunks.get(k);
    const hadCollider = !!old?.collider, hadGrass = !!old?.grass;
    this.drop(k);
    this.group.add(mesh, scatter);
    const chunk: LiveChunk = {
      cx: d.cx, cz: d.cz, mesh, scatter, lod, items: d.scatter, grassData: d.grass, grass: null, positions: d.positions, indices: d.indices, collider: null, stale: false,
    };
    if (hadCollider) chunk.collider = this.physics.addTerrain(d.positions, d.indices);
    if (hadGrass && d.grass.length) { chunk.grass = this.grass.build(d.grass); this.group.add(chunk.grass); }
    this.chunks.set(k, chunk);
  }

  private drop(k: string): void {
    const c = this.chunks.get(k);
    if (!c) return;
    this.group.remove(c.mesh, c.scatter);
    c.mesh.geometry.dispose();
    for (const child of c.scatter.children) (child as THREE.InstancedMesh).dispose();
    this.dropGrass(c);
    if (c.collider) this.physics.removeCollider(c.collider);
    this.chunks.delete(k);
    this.queue.forget(k);
  }

  /** The tuft geometry and material are shared by GrassSystem; only the per-chunk instance buffers are freed. */
  private dropGrass(c: LiveChunk): void {
    if (!c.grass) return;
    this.group.remove(c.grass);
    c.grass.dispose();
    c.grass = null;
  }
}
