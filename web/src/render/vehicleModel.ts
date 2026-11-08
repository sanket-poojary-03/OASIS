import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** The car parked at every spawn: Quaternius "Sports Car" (CC0), bundled; real size (3.9 m long), facing +z. */
export const CAR_FILE = 'models/vehicles/sports-car.glb';

const WHEEL = /wheel|tyre|tire/i;
const PIVOT = 'wheel-pivot';
/** A wheel's outer face stops this far inside the widest part of the body, so it fills its arch without poking out. */
const WHEEL_INSET = 0.03;

export interface Wheels { all: THREE.Object3D[]; front: THREE.Object3D[]; radius: number }

/** The triangles of `g` on one side of x = 0 (an exported axle is often one mesh holding both of its wheels). */
function sideOf(g: THREE.BufferGeometry, sign: number): THREE.BufferGeometry | null {
  const flat = g.index ? g.toNonIndexed() : g.clone();
  const pos = flat.attributes.position;
  const keep: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    if ((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) * sign > 0) keep.push(i, i + 1, i + 2);
  }
  if (keep.length === 0) return null;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(flat.attributes)) {
    const a = flat.attributes[name];
    const data = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, k) => { for (let c = 0; c < a.itemSize; c++) data[k * a.itemSize + c] = a.getComponent(v, c); });
    out.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize));
  }
  return out;
}

/**
 * Rebuilds the wheel parts of a car once, on its template (clones inherit the result): one pivot per real wheel, at
 * its axle, holding that wheel's parts. Exports vary: this model's back axle is one mesh with both wheels in it, and a
 * front wheel is a tyre and a hub with different middles, which came apart when each was spun about its own.
 */
function rigWheels(model: THREE.Object3D): void {
  model.updateWorldMatrix(true, true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const parts: THREE.Mesh[] = [];
  let bodyX = 0;
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (WHEEL.test(`${o.name} ${o.parent?.name ?? ''}`)) { parts.push(o); return; }
    // Measured in the model's own frame: an adopted car already stands somewhere in the world.
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const box = o.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toModel, o.matrixWorld));
    bodyX = Math.max(bodyX, Math.abs(box.min.x), Math.abs(box.max.x));
  });
  const groups = new Map<string, Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry }>>();
  for (const mesh of parts) {
    const g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toModel, mesh.matrixWorld));
    g.computeBoundingBox();
    const both = g.boundingBox!.min.x < -0.1 && g.boundingBox!.max.x > 0.1;
    for (const piece of both ? [sideOf(g, -1), sideOf(g, 1)] : [g]) {
      if (!piece) continue;
      piece.computeBoundingBox();
      const c = piece.boundingBox!.getCenter(new THREE.Vector3());
      const key = `${Math.sign(c.x)}:${Math.round(c.z)}`;
      groups.set(key, [...(groups.get(key) ?? []), { mesh, geometry: piece }]);
    }
  }
  for (const pieces of groups.values()) {
    const box = new THREE.Box3();
    for (const p of pieces) box.union(p.geometry.boundingBox!);
    const c = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.name = PIVOT;
    pivot.rotation.order = 'YXZ';
    const outer = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    pivot.position.set(c.x + Math.sign(c.x) * Math.max(0, bodyX - WHEEL_INSET - outer), c.y, c.z);
    for (const p of pieces) {
      p.geometry.translate(-c.x, -c.y, -c.z);
      p.geometry.computeBoundingSphere();
      const part = new THREE.Mesh(p.geometry, p.mesh.material);
      part.castShadow = p.mesh.castShadow;
      part.receiveShadow = p.mesh.receiveShadow;
      pivot.add(part);
    }
    pivot.userData.front = c.z > 0; // the car faces +z
    pivot.userData.radius = (box.max.y - box.min.y) / 2;
    model.add(pivot);
  }
  for (const mesh of parts) mesh.removeFromParent();
}

/** The wheels of a car, rigged on first sight of its template; a clone only has to find them. */
export function wheelsOf(model: THREE.Object3D): Wheels {
  if (!model.getObjectByName(PIVOT)) rigWheels(model);
  const all: THREE.Object3D[] = [], front: THREE.Object3D[] = [];
  let radius = 0.35;
  model.traverse((o) => {
    if (o.name !== PIVOT) return;
    all.push(o);
    if (o.userData.front) front.push(o);
    radius = Math.max(0.2, (o.userData.radius as number) * model.getWorldScale(new THREE.Vector3()).y);
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
