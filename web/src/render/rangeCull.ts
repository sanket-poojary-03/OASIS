import * as THREE from 'three';
import { CHUNK_SIZE } from '../world/chunkData';
import type { Vec2 } from '../world/river';
import { VIEW_RADIUS } from './deviceTier';

/** The radius of terrain always loaded around the camera (VIEW chunks), less a margin for the chunk being streamed in. */
export const TERRAIN_RANGE = VIEW_RADIUS * CHUNK_SIZE - 8;

/** How often (seconds) visibility is refreshed; things this far out move slowly across the screen. */
const EVERY = 0.2;
/** Placed objects are judged by their position plus this radius (a castle's far wall still shows when its centre is just out). */
const OBJECT_RADIUS = 24;

/**
 * Hides what lies beyond the loaded terrain. Land exists only within a few chunks of the camera, so anything drawn
 * past that edge (a castle on an unloaded peak, a road network, a lake) hangs in the sky: fog paints it one flat
 * colour, but the sky behind it is not that colour. Only visibility changes; colliders and logic are untouched.
 */
export class RangeCuller {
  private groups: Array<{ root: THREE.Object3D; objects: boolean }> = [];
  private wait = 0;
  private readonly sphere = new THREE.Sphere();

  constructor(private readonly range: number) {}

  /** `objects`: children are placed-object roots (judged by position); otherwise meshes (judged by their geometry). */
  track(root: THREE.Object3D, objects = false): void {
    this.groups = this.groups.filter((g) => g.root.parent !== null && g.root !== root);
    this.groups.push({ root, objects });
    this.wait = 0;
  }

  update(dt: number, viewer: THREE.Vector3): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = EVERY;
    for (const g of this.groups) for (const c of g.root.children) c.visible = this.inRange(c, g.objects, viewer);
  }

  private inRange(o: THREE.Object3D, object: boolean, viewer: THREE.Vector3): boolean {
    if (o.userData.alwaysVisible) return true;
    let x = o.position.x, z = o.position.z, r = OBJECT_RADIUS;
    if (!object && o instanceof THREE.Mesh) {
      const geo = o.geometry as THREE.BufferGeometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      this.sphere.copy(geo.boundingSphere!).applyMatrix4(o.matrixWorld);
      x = this.sphere.center.x; z = this.sphere.center.z; r = this.sphere.radius;
    }
    return Math.hypot(x - viewer.x, z - viewer.z) - r < this.range;
  }
}

/** A long polyline cut into overlapping runs of at most `n` points, so each piece can be hidden on its own. */
export function pieces(points: Vec2[], n = 16): Vec2[][] {
  if (points.length <= n) return [points];
  const out: Vec2[][] = [];
  for (let i = 0; i < points.length - 1; i += n - 1) out.push(points.slice(i, Math.min(points.length, i + n)));
  return out;
}
