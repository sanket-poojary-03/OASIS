import * as THREE from 'three';

const box = new THREE.Box3();

/**
 * The one "scale to height, feet at y = 0" helper (used by normalizeTo, animatedClone and ScatterAssets.useModel).
 * Scales `object` uniformly so its bounding box is `height` tall, then moves it so its lowest point is at y = 0 and,
 * with `centre`, its x/z centre is on the origin. Works in world space: call it on an object that has no parent.
 */
export function fitToHeight(object: THREE.Object3D, height: number, centre = true): THREE.Object3D {
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  if (box.isEmpty()) return object;
  const h = box.max.y - box.min.y;
  if (h > 0) object.scale.multiplyScalar(height / h);
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  if (centre) {
    object.position.x -= (box.min.x + box.max.x) / 2;
    object.position.z -= (box.min.z + box.max.z) / 2;
  }
  object.position.y -= box.min.y;
  object.updateMatrixWorld(true);
  return object;
}
