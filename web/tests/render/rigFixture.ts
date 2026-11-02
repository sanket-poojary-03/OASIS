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
