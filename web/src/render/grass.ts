import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One tapered blade (5 vertices, 3 triangles) with a dark-base to light-tip vertex colour. */
function blade(angle: number, offset: number): THREE.BufferGeometry {
  const w = 0.07, h = 0.7;
  const pos = [-w, 0, 0, w, 0, 0, -w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, 0, 0, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const base = new THREE.Color(0x3f6b2a), tip = new THREE.Color(0x9cc95e), c = new THREE.Color();
  const col: number[] = [];
  for (let i = 0; i < 5; i++) { c.copy(base).lerp(tip, pos[i * 3 + 1] / h); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateY(angle);
  g.translate(Math.cos(angle) * offset, 0, Math.sin(angle) * offset);
  g.computeVertexNormals();
  return g;
}

/**
 * Instanced wind grass. One shared tuft geometry and material for the page lifetime; the sway runs in the vertex
 * shader (no per-frame CPU work beyond two uniforms). Chunks own their InstancedMesh and dispose it when dropped.
 */
export class GrassSystem {
  readonly uniforms = { time: { value: 0 }, wind: { value: 0.4 } };
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  private readonly geometry = mergeGeometries([blade(0, 0.05), blade(2.1, 0.08), blade(4.2, 0.06), blade(1.0, 0.12)])!;
  private readonly dummy = new THREE.Object3D();

  constructor() {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.time;
      shader.uniforms.uWind = this.uniforms.wind;
      shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 2.0 + ip.x * 0.15 + ip.z * 0.1) * 0.6 + sin(uTime * 3.7 + ip.x * 0.4) * 0.25;
        float bend = position.y * position.y;
        transformed.x += sway * uWind * bend;
        transformed.z += sway * uWind * 0.5 * bend;`,
      );
    };
  }

  /** `data` is ChunkData.grass: x, y, z, rotation, scale per tuft. */
  build(data: Float32Array): THREE.InstancedMesh {
    const count = Math.floor(data.length / 5);
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    for (let i = 0; i < count; i++) {
      this.dummy.position.set(data[i * 5], data[i * 5 + 1], data[i * 5 + 2]);
      this.dummy.rotation.set(0, data[i * 5 + 3], 0);
      this.dummy.scale.setScalar(data[i * 5 + 4]);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  /** `wind` is the recipe's atmosphere.wind (0..1); calm air still moves the blades a little. */
  update(t: number, wind: number): void {
    this.uniforms.time.value = t;
    this.uniforms.wind.value = 0.15 + wind * 0.85;
  }
}
