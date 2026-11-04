import * as THREE from 'three';

/**
 * Rivers and lakes: two layers of ripples drifting across a standard material, with the sky mirrored at low angles.
 * Only the sea has true reflections, since each reflective surface draws the whole scene again.
 */
export function rippleMaterial(normals: THREE.Texture, time: THREE.IUniform<number>, sky: THREE.IUniform<THREE.Color>): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRippleMap = { value: normals };
    shader.uniforms.uRippleTime = time;
    shader.uniforms.uRippleSky = sky;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRipplePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRipplePos = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRipplePos;\nuniform sampler2D uRippleMap;\nuniform float uRippleTime;\nuniform vec3 uRippleSky;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 rippleA = texture2D(uRippleMap, vRipplePos / 22.0 + uRippleTime * vec2(0.021, 0.013)).xyz * 2.0 - 1.0;
vec3 rippleB = texture2D(uRippleMap, vRipplePos / 9.0 - uRippleTime * vec2(0.017, 0.031)).xyz * 2.0 - 1.0;
normal = normalize((viewMatrix * vec4(rippleA.x + rippleB.x, 2.0, rippleA.y + rippleB.y, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, uRippleSky, 0.02 + 0.98 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 5.0));
#include <opaque_fragment>`);
  };
  return material;
}
