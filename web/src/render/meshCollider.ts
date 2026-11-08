import * as THREE from 'three';
import type { ModelBase } from '../world/groundPose';

/**
 * Most triangles in a model's collider. Pushing against a 5-12k-triangle house ran the character controller's full 20
 * iterations every frame (5 ms), so a detailed model collides as a simpler copy of its own shape, with no walls in the air.
 */
export const MAX_COLLIDER_TRIS = 1500;
/** The first simplifying grid has this many cells along the model's longest diagonal; each try is coarser. */
const FIRST_GRID = 64;
const COARSER = 1.5;
/** Packs a cell's three grid numbers into one key; a grid is never this many cells across. */
const CELL_KEY = 4096;
/** The lowest part of a model, as a share of its height (and at least this many metres), counts as its base. */
const BASE_SHARE = 0.15;
const MIN_BASE_BAND = 0.1;
/** Enough vertices to find a base; a heavy model is not read in full. */
const BASE_VERTICES = 8000;

export interface Surface { positions: Float32Array; indices: Uint32Array }

/**
 * What `root` draws. Its own `visible` does not count: the range culler hides a far object, and a model that finishes
 * loading out there still needs its real shape (reading only visible objects gave all of those a box).
 */
function drawnMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D): void => {
    if (o instanceof THREE.Mesh && o.geometry.getAttribute('position')) meshes.push(o);
    for (const c of o.children) if (c.visible) walk(c);
  };
  walk(root);
  return meshes;
}

/** A vertex as drawn, in its mesh's own space: a rigged one follows its bones. */
function readVertex(m: THREE.Mesh, pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, into: THREE.Vector3): THREE.Vector3 {
  return m instanceof THREE.SkinnedMesh ? m.getVertexPosition(i, into) : into.fromBufferAttribute(pos, i);
}

/**
 * The world-space triangles of everything drawn under `root`, for a collider shaped like the model itself: the player
 * stands on a roof, a statue's base or a manhole cover, and walks right up to its walls. Heavy models are simplified
 * first. Null only when there is nothing drawn.
 */
export function surfaceOf(root: THREE.Object3D): Surface | null {
  root.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true); // this one also refreshes a rigged mesh's bind matrix, which getVertexPosition reads
  const meshes = drawnMeshes(root);
  if (!meshes.length) return null;
  let vertices = 0, corners = 0;
  for (const m of meshes) {
    const g = m.geometry, count = g.getAttribute('position').count;
    vertices += count;
    corners += g.index ? g.index.count : count;
  }
  const positions = new Float32Array(vertices * 3), indices = new Uint32Array(corners);
  const v = new THREE.Vector3();
  let at = 0, next = 0;
  for (const m of meshes) {
    const g = m.geometry, pos = g.getAttribute('position'), base = at / 3;
    for (let i = 0; i < pos.count; i++, at += 3) {
      readVertex(m, pos, i, v).applyMatrix4(m.matrixWorld);
      positions[at] = v.x; positions[at + 1] = v.y; positions[at + 2] = v.z;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) indices[next++] = base + g.index.getX(i);
    else for (let i = 0; i < pos.count; i++) indices[next++] = base + i;
  }
  return simplifySurface({ positions, indices }, MAX_COLLIDER_TRIS);
}

/**
 * Vertex clustering: every vertex in a grid cell merges into their average, and triangles that collapse are dropped. The
 * grid coarsens until the result fits `maxTris`. It keeps the shape's gaps and overhangs, unlike a box or a convex hull.
 */
export function simplifySurface(surface: Surface, maxTris: number): Surface {
  if (surface.indices.length / 3 <= maxTris) return surface;
  const box = new THREE.Box3().setFromArray(surface.positions);
  let cell = box.getSize(new THREE.Vector3()).length() / FIRST_GRID;
  let merged = surface;
  do {
    merged = cluster(merged, box.min, cell); // from the last result: each pass has less to read
    cell *= COARSER;
  } while (merged.indices.length / 3 > maxTris);
  return merged;
}

function cluster({ positions, indices }: Surface, min: THREE.Vector3, cell: number): Surface {
  const ids = new Map<number, number>();
  const count = positions.length / 3;
  const sums = new Float64Array(count * 3), weights = new Uint32Array(count), idOf = new Uint32Array(count);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const key = Math.floor((x - min.x) / cell) + Math.floor((y - min.y) / cell) * CELL_KEY + Math.floor((z - min.z) / cell) * CELL_KEY * CELL_KEY;
    let id = ids.get(key);
    if (id === undefined) { id = n++; ids.set(key, id); }
    idOf[i] = id;
    weights[id]++;
    sums[id * 3] += x; sums[id * 3 + 1] += y; sums[id * 3 + 2] += z;
  }
  const merged = new Float32Array(n * 3);
  for (let id = 0; id < n; id++) for (let k = 0; k < 3; k++) merged[id * 3 + k] = sums[id * 3 + k] / weights[id];
  const seen = new Set<number>(), kept: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = idOf[indices[i]], b = idOf[indices[i + 1]], c = idOf[indices[i + 2]];
    if (a === b || b === c || a === c) continue;
    const low = Math.min(a, b, c), high = Math.max(a, b, c), mid = a + b + c - low - high;
    const key = (low * n + mid) * n + high; // the two faces of a thin wall collapse into one
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(a, b, c);
  }
  return { positions: merged, indices: new Uint32Array(kept) };
}

/**
 * The part of a model that meets the ground, in `content`'s own space: the extent of its lowest vertices. A windmill's
 * sails or a lamp's arm do not count. Call it on a `content` that has no parent yet.
 */
export function baseOf(content: THREE.Object3D): ModelBase {
  content.updateMatrixWorld(true);
  const meshes = drawnMeshes(content);
  const total = meshes.reduce((n, m) => n + m.geometry.getAttribute('position').count, 0);
  const stride = Math.max(1, Math.floor(total / BASE_VERTICES));
  const v = new THREE.Vector3(), points: number[] = [];
  let low = Infinity, high = -Infinity;
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += stride) {
      readVertex(m, pos, i, v).applyMatrix4(m.matrixWorld);
      points.push(v.x, v.y, v.z);
      low = Math.min(low, v.y);
      high = Math.max(high, v.y);
    }
  }
  const band = low + Math.max(MIN_BASE_BAND, (high - low) * BASE_SHARE);
  const base: ModelBase = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 1] > band) continue;
    base.minX = Math.min(base.minX, points[i]); base.maxX = Math.max(base.maxX, points[i]);
    base.minZ = Math.min(base.minZ, points[i + 2]); base.maxZ = Math.max(base.maxZ, points[i + 2]);
  }
  return base.minX === Infinity ? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } : base;
}
