import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Triangles one scatter model may have near the camera, and in the outer rings. Scatter is drawn by the thousand, so a
 * model's weight multiplies: a twisted tree of 9.6k triangles made a haunted swamp draw 4.1M a frame where the same
 * land with preset trees drew 1.3M. The near budget is a preset oak's; past the near chunks the land is in fog.
 */
export const NEAR_TRIS = 4500;
export const FAR_TRIS = 1500;

const trianglesOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

export function triangleCount(object: THREE.Object3D): number {
  let n = 0;
  object.traverse((o) => { if (o instanceof THREE.Mesh) n += trianglesOf(o.geometry); });
  return n;
}

let modifier: SimplifyModifier | null = null;

/**
 * Simplify every mesh of `object` in proportion (meshoptimizer, weighing normals and UVs so shading and texture seams
 * hold), so the whole comes to about `budget` triangles. A model under the budget is left as it was. Each mesh gets a
 * new geometry, so a clone that shares the old one is untouched; materials stay.
 */
export async function fitTriangles(object: THREE.Object3D, budget: number): Promise<void> {
  const total = triangleCount(object);
  if (total <= budget) return;
  const keep = budget / total;
  const meshes: THREE.Mesh[] = [];
  object.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
  for (const mesh of meshes) {
    // Welded first, so "how many vertices to remove" is counted on the vertices the simplifier sees.
    const welded = mesh.geometry.index ? mesh.geometry : mergeVertices(mesh.geometry);
    const count = Math.floor(welded.getAttribute('position').count * (1 - keep));
    mesh.geometry = await (modifier ??= new SimplifyModifier()).modify(welded, count);
  }
}
