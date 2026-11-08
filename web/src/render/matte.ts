import * as THREE from 'three';

/**
 * Many model packs export their materials as part metal (the Quaternius nature and medieval packs at 0.4). Metal shows
 * what it reflects, and this world has no environment map to reflect, so those parts just draw dark: trees and houses
 * came out nearly black on any side the sun was not on. Only a material with its own metal map keeps its metal.
 */
export function matteMaterials<T extends THREE.Object3D>(model: T): T {
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m instanceof THREE.MeshStandardMaterial && !m.metalnessMap) m.metalness = 0;
    }
  });
  return model;
}
