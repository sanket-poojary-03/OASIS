import * as THREE from 'three';
import type { Vec2 } from '../world/river';

/** Pure vertex math: two vertices per point (left, right of travel), two triangles per segment. */
export function ribbonData(points: Vec2[], halfWidth: number, yAt: (x: number, z: number) => number): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len, nz = tx / len;
    const p = points[i];
    const y = yAt(p.x, p.z);
    positions.push(p.x + nx * halfWidth, y, p.z + nz * halfWidth, p.x - nx * halfWidth, y, p.z - nz * halfWidth);
    if (i > 0) {
      const k = i * 2;
      indices.push(k - 2, k, k - 1, k - 1, k, k + 1); // counter-clockwise from above: normals face +y
    }
  }
  return { positions, indices };
}

export function ribbonGeometry(points: Vec2[], halfWidth: number, yAt: (x: number, z: number) => number): THREE.BufferGeometry {
  const { positions, indices } = ribbonData(points, halfWidth, yAt);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
