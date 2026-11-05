import * as THREE from 'three';
import type { Part } from '../api/parts';

/** One unit geometry per shape, scaled per part. Shared by every model, so the world's clear never disposes them. */
const GEOMETRY: Record<Part['shape'], THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cone: new THREE.ConeGeometry(0.5, 1, 16),
  pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  ring: new THREE.TorusGeometry(0.36, 0.14, 10, 24).rotateX(Math.PI / 2),
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string): THREE.MeshStandardMaterial {
  const key = color.toLowerCase();
  let m = materials.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: key, roughness: 0.8, flatShading: true }); materials.set(key, m); }
  return m;
}

/** Builds a model from validated parts (metres, y up, standing on y = 0). Sizing to its place happens like any other model's. */
export function buildProcedural(parts: readonly Part[]): THREE.Group {
  const group = new THREE.Group();
  for (const p of parts) {
    const mesh = new THREE.Mesh(GEOMETRY[p.shape], material(p.color));
    mesh.position.set(...p.at);
    mesh.scale.set(...p.size);
    if (p.rotate) mesh.rotation.set(...p.rotate);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
