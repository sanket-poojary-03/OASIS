import * as THREE from 'three';
import type { ModelTemplate } from '../../src/render/animated';

/** A tiny "rigged" template: a 1 x 3 x 1 box named body, with clips that move it (names as in the packs). */
export function fakeTemplate(height: number, names = ['Idle_HitReact', 'Idle', 'Walk', 'Gallop', 'Death']): ModelTemplate {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshStandardMaterial());
  body.name = 'body';
  body.position.y = 1.5;
  scene.add(body);
  const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('body.position', [0, 1], [0, 1.5, 0, 0, 1.6, 0])]);
  return { scene, animations: names.map(clip), height };
}

/**
 * A REAL rigged model as GLTFLoader gives it (never added to a scene): a 1 x 2 x 1 box, feet on y = 0, skinned to two
 * bones (the top half follows the second bone).
 */
export function skinnedTemplate(): THREE.Group {
  const geo = new THREE.BoxGeometry(1, 2, 1, 1, 2, 1);
  geo.translate(0, 1, 0);
  const n = geo.attributes.position.count;
  const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { index[i * 4] = geo.attributes.position.getY(i) > 1 ? 1 : 0; weight[i * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  const root = new THREE.Group();
  const b0 = new THREE.Bone(), b1 = new THREE.Bone();
  b1.position.y = 1;
  b0.add(b1);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = 'skinned';
  root.add(mesh);
  mesh.add(b0);
  mesh.bind(new THREE.Skeleton([b0, b1]));
  return root;
}

/** World-space bounds as the GPU draws them: skinned vertices follow their bones (like the skinning shader). */
export function renderedBox(root: THREE.Object3D): THREE.Box3 {
  let top: THREE.Object3D = root;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}
