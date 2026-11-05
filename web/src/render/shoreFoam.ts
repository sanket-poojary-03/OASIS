import * as THREE from 'three';

/** Shared by the terrain material and WaterSystem, which sets them for each world and frame. */
export const foamUniforms = {
  uFoamTime: { value: 0 },
  uFoamSea: { value: 0 },
  /** 1 where this world has a sea with shores, else 0. */
  uFoamOn: { value: 0 },
};

/**
 * Water.js has no foam, so the shore draws its own: a broken white line lapping up and down on the ground just above
 * the sea, with damp ground behind it. The ground's height is all it needs, so it adds no pass or texture.
 */
export function addShoreFoam(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, foamUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFoamPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoamPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFoamPos;\nuniform float uFoamTime;\nuniform float uFoamSea;\nuniform float uFoamOn;')
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uFoamOn > 0.5) {
  float above = vFoamPos.y - uFoamSea;
  float lap = 0.14 * sin(uFoamTime * 0.8 + (vFoamPos.x + vFoamPos.z) * 0.07);
  float broken = 0.5 + 0.25 * sin(vFoamPos.x * 1.3 + uFoamTime * 0.5) + 0.25 * sin(vFoamPos.z * 1.7 - uFoamTime * 0.4);
  // Only at the waterline. Deep under the sea this painted the sine grid over the whole bed, unseen until you could dive.
  float atLine = smoothstep(-0.3, 0.0, above);
  diffuseColor.rgb *= 1.0 - 0.3 * atLine * (1.0 - smoothstep(0.0, 0.9, above - lap));
  float foam = atLine * (1.0 - smoothstep(0.08, 0.32, above - lap)) * smoothstep(0.2, 0.55, broken);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), foam);
}`);
  };
}
