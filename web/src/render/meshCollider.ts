import * as THREE from 'three';

/** Above this many triangles a model keeps a box collider (a big trimesh costs a BVH build on the main thread). */
export const MAX_COLLIDER_TRIS = 20000;

/**
 * The world-space triangles of everything drawn under `root`, for a collider shaped like the model itself: the player
 * stands on a roof, a statue's base or a manhole cover, not on top of their bounding box. Null when a box is the better
 * fit: nothing to draw, a rigged (skinned) part that moves, or too many triangles.
 */
export function surfaceOf(root: THREE.Object3D): { positions: Float32Array; indices: Uint32Array } | null {
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  let skinned = false, tris = 0;
  root.traverseVisible((o) => {
    if (o instanceof THREE.SkinnedMesh) skinned = true;
    else if (o instanceof THREE.Mesh && o.geometry.getAttribute('position')) {
      meshes.push(o);
      const g = o.geometry as THREE.BufferGeometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
  });
  if (skinned || !meshes.length || tris > MAX_COLLIDER_TRIS) return null;
  const positions: number[] = [], indices: number[] = [];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry as THREE.BufferGeometry, pos = g.getAttribute('position'), base = positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      positions.push(v.x, v.y, v.z);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) indices.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) indices.push(base + i);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
