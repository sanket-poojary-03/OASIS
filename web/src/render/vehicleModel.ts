import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** The car parked at every spawn: Quaternius "Sports Car" (CC0), bundled; real size (3.9 m long), facing +z. */
export const CAR_FILE = 'models/vehicles/sports-car.glb';

const WHEEL = /wheel|tyre|tire/i;
const FRONT = /front/i;

export interface Wheels { all: THREE.Object3D[]; front: THREE.Object3D[]; radius: number }

/**
 * Wheel parts as spinnable pivots. Exported wheels often carry their position in the vertices (pivot at the model
 * origin), so each wheel mesh is re-centred on its own middle once: it then spins about its axle. Marked, so shared
 * geometry is never shifted twice.
 */
export function wheelsOf(model: THREE.Object3D): Wheels {
  const all: THREE.Object3D[] = [], front: THREE.Object3D[] = [];
  let radius = 0.35;
  model.traverse((o) => {
    // A multi-material wheel loads as a group of meshes (hub, tyre): the name may sit on either.
    const name = `${o.name} ${o.parent?.name ?? ''}`;
    if (!(o instanceof THREE.Mesh) || !WHEEL.test(name)) return;
    const g = o.geometry as THREE.BufferGeometry;
    if (!g.userData.centred) {
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      g.userData.centred = c.toArray();
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
    if (!o.userData.wheelPlaced) {
      o.position.add(new THREE.Vector3().fromArray(g.userData.centred as number[]));
      o.userData.wheelPlaced = true;
    }
    o.rotation.order = 'YXZ';
    radius = Math.max(0.2, (g.boundingBox!.max.y - g.boundingBox!.min.y) / 2);
    all.push(o);
    if (FRONT.test(name)) front.push(o);
  });
  return { all, front, radius };
}

/** Loads the bundled car once; callers clone it. */
export function loadCarTemplate(base = import.meta.env?.BASE_URL ?? '/'): Promise<THREE.Object3D> {
  return new GLTFLoader().loadAsync(`${base}${CAR_FILE}`).then((g) => {
    g.scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g.scene;
  });
}
