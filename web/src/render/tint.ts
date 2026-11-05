import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/** How much of a surface's own lightness survives: a tinted model keeps its light and dark parts, even a nearly black one. */
const KEEP_SHADE = 0.6;

type Colored = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; vertexColors?: boolean };

/**
 * A copy of `object` recoloured to `hex`, for the right model in the wrong colour. Its materials are copied, so the
 * shared template stays as it was. Textures and vertex colours multiply with the material colour, so those get the tint
 * itself; flat colours get the tint shaded by how light they were. It is one colour for the whole model, never per part.
 */
export function tintedCopy(object: THREE.Object3D, hex: string): THREE.Object3D {
  const tint = new THREE.Color(hex);
  const copy = SkeletonUtils.clone(object);
  const done = new Map<THREE.Material, THREE.Material>();
  const recolour = (source: THREE.Material): THREE.Material => {
    const known = done.get(source);
    if (known) return known;
    const m = source.clone() as Colored;
    if (m.color) {
      const hsl = { h: 0, s: 0, l: 0 };
      m.color.getHSL(hsl);
      if (m.map || m.vertexColors) m.color.copy(tint);
      else m.color.copy(tint).multiplyScalar(1 - KEEP_SHADE + KEEP_SHADE * Math.min(1, hsl.l * 2));
    }
    done.set(source, m);
    return m;
  };
  copy.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map(recolour) : recolour(o.material);
  });
  return copy;
}
