import * as THREE from 'three';

/** With no sea to fade into: lower than any ground. */
export const NO_FADE = -1e6;
/** Metres above `fadeFrom` over which a surface fades in. */
const FADE_OVER = '1.5';

/**
 * Rivers and lakes: two layers of ripples drifting across a standard material, with the sky mirrored at low angles.
 * Only the sea has true reflections, since each reflective surface draws the whole scene again.
 */
export function rippleMaterial(normals: THREE.Texture, time: THREE.IUniform<number>, sky: THREE.IUniform<THREE.Color>, fadeFrom: THREE.IUniform<number> = { value: NO_FADE }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRippleMap = { value: normals };
    shader.uniforms.uRippleTime = time;
    shader.uniforms.uRippleSky = sky;
    shader.uniforms.uRippleFadeFrom = fadeFrom;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRipplePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRipplePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRipplePos;\nuniform sampler2D uRippleMap;\nuniform float uRippleTime;\nuniform vec3 uRippleSky;\nuniform float uRippleFadeFrom;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 rippleA = texture2D(uRippleMap, vRipplePos.xz / 22.0 + uRippleTime * vec2(0.021, 0.013)).xyz * 2.0 - 1.0;
vec3 rippleB = texture2D(uRippleMap, vRipplePos.xz / 9.0 - uRippleTime * vec2(0.017, 0.031)).xyz * 2.0 - 1.0;
normal = normalize((viewMatrix * vec4(rippleA.x + rippleB.x, 2.0, rippleA.y + rippleB.y, 0.0)).xyz);`)
      // The cap: the moon's glint on sharp ripples went far above white, and night bloom turned it into a blinding patch.
      .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, uRippleSky, 0.02 + 0.98 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 5.0));
outgoingLight = min(outgoingLight, vec3(1.0));
diffuseColor.a *= smoothstep(uRippleFadeFrom, uRippleFadeFrom + ${FADE_OVER}, vRipplePos.y);
#include <opaque_fragment>`);
  };
  return material;
}
