import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import type { Road, WorldField } from '../world/field';
import type { Vec2 } from '../world/river';
import { ribbonData, ribbonGeometry } from './ribbon';

const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** Subdivide a polyline to at most maxStep; `bridge[j]` is the flag of sub-segment j (from the raw segment's flag). */
export function densify(points: Vec2[], bridges: boolean[] = [], maxStep = 3): { points: Vec2[]; bridge: boolean[] } {
  if (points.length === 0) return { points: [], bridge: [] };
  const out: Vec2[] = [points[0]];
  const bridge: boolean[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxStep));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      bridge.push(bridges[i] === true);
    }
  }
  return { points: out, bridge };
}

/** Height the road ribbon is drawn at (raised above water, hugging terrain elsewhere). */
export function roadY(field: Pick<WorldField, 'waterSurfaceAt' | 'heightAt'>, x: number, z: number): number {
  const surface = field.waterSurfaceAt(x, z);
  return surface !== null ? Math.max(surface, field.heightAt(x, z)) + 1.2 : field.heightAt(x, z) + 0.12;
}

export function buildRoadMeshes(field: WorldField, roads: Road[]): THREE.Group {
  const group = new THREE.Group();
  for (const road of roads) {
    const mesh = new THREE.Mesh(ribbonGeometry(densify(road.points, road.bridges).points, road.width / 2, (x, z) => roadY(field, x, z)), roadMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Deck mesh data (same vertices as the drawn ribbon) for each run of bridge spans, plus one ramp step onto each bank. */
export function bridgeDeckData(field: Pick<WorldField, 'waterSurfaceAt' | 'heightAt'>, road: Road): Array<{ positions: number[]; indices: number[] }> {
  const { points, bridge } = densify(road.points, road.bridges);
  const out: Array<{ positions: number[]; indices: number[] }> = [];
  for (let j = 0; j < bridge.length; j++) {
    if (!bridge[j]) continue;
    let e = j;
    while (e + 1 < bridge.length && bridge[e + 1]) e++;
    const from = Math.max(0, j - 1), to = Math.min(bridge.length - 1, e + 1);
    out.push(ribbonData(points.slice(from, to + 2), road.width / 2, (x, z) => roadY(field, x, z)));
    j = e;
  }
  return out;
}

/** One thin trimesh per bridge run, built from the same vertices as the drawn deck. Free with removeBridgeColliders on rebuild. */
export function addBridgeColliders(field: Pick<WorldField, 'waterSurfaceAt' | 'heightAt'>, roads: Road[], physics: Pick<Physics, 'addTerrain'>): Collider[] {
  const out: Collider[] = [];
  for (const road of roads) {
    for (const d of bridgeDeckData(field, road)) {
      if (d.indices.length === 0) continue;
      out.push(physics.addTerrain(new Float32Array(d.positions), new Uint32Array(d.indices)));
    }
  }
  return out;
}

export function removeBridgeColliders(colliders: Collider[], physics: Pick<Physics, 'removeCollider'>): void {
  for (const c of colliders) physics.removeCollider(c);
  colliders.length = 0;
}
