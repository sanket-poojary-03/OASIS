import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import type { Road, WorldField } from '../world/field';
import type { Vec2 } from '../world/river';
import { ribbonGeometry } from './ribbon';

const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const DECK_THICKNESS = 0.4;

function densify(points: Vec2[], maxStep = 3): Vec2[] {
  const out: Vec2[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxStep));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

/** Height the road ribbon is drawn at (raised above water, hugging terrain elsewhere). */
function roadY(field: WorldField, x: number, z: number): number {
  const surface = field.waterSurfaceAt(x, z);
  return surface !== null ? Math.max(surface, field.heightAt(x, z)) + 1.2 : field.heightAt(x, z) + 0.12;
}

export function buildRoadMeshes(field: WorldField, roads: Road[]): THREE.Group {
  const group = new THREE.Group();
  for (const road of roads) {
    const mesh = new THREE.Mesh(ribbonGeometry(densify(road.points), road.width / 2, (x, z) => roadY(field, x, z)), roadMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** One fixed box per bridge segment so the player walks over water. Free them with removeBridgeColliders on rebuild. */
export function addBridgeColliders(field: WorldField, roads: Road[], physics: Physics): Collider[] {
  const out: Collider[] = [];
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      if (!road.bridges[i]) continue;
      const a = road.points[i], b = road.points[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const top = (roadY(field, a.x, a.z) + roadY(field, b.x, b.z)) / 2;
      // box local +z runs along the segment: rotate about y by atan2(dx, dz)
      out.push(physics.addFixedBox((a.x + b.x) / 2, top - DECK_THICKNESS / 2, (a.z + b.z) / 2, road.width / 2, DECK_THICKNESS / 2, len / 2 + 0.3, Math.atan2(dx, dz)));
    }
  }
  return out;
}

export function removeBridgeColliders(colliders: Collider[], physics: Physics): void {
  for (const c of colliders) physics.removeCollider(c);
  colliders.length = 0;
}
