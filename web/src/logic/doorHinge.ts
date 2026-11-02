import * as THREE from 'three';

/** Named like a door, but not the parts around one. */
const DOOR = /door/i;
const NOT_DOOR = /frame|way|step|mat|knob|handle|bell|trim/i;

/** The first part of a loaded model named like a door (e.g. "Door_Front"), or null when the model has none. */
export function findDoorNode(content: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  content.traverse((o) => {
    if (found || !DOOR.test(o.name) || NOT_DOOR.test(o.name)) return;
    if (!new THREE.Box3().setFromObject(o).isEmpty()) found = o;
  });
  return found;
}

/**
 * Re-parent `door` onto a hinge at its edge so turning the hinge about y swings it, without moving it now.
 * The hinge sits on the door's left edge along its wide side (root-local), and is returned for the caller to turn.
 */
export function hingeDoor(root: THREE.Object3D, door: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const local = new THREE.Box3().setFromObject(door).applyMatrix4(root.matrixWorld.clone().invert());
  const pivot = new THREE.Group();
  pivot.name = 'door-hinge';
  const size = local.getSize(new THREE.Vector3());
  if (size.x >= size.z) pivot.position.set(local.min.x, 0, (local.min.z + local.max.z) / 2);
  else pivot.position.set((local.min.x + local.max.x) / 2, 0, local.min.z);
  root.add(pivot);
  pivot.updateMatrixWorld(true);
  pivot.attach(door);
  return pivot;
}
