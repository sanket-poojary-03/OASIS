import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addShoreFoam } from '../../src/render/shoreFoam';

function fragment(): string {
  const m = new THREE.MeshStandardMaterial();
  addShoreFoam(m);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  m.onBeforeCompile(shader as never, null as never);
  return shader.fragmentShader;
}

describe('shore foam', () => {
  it('fades out below the waterline, so a sea bed is not painted', () => {
    const f = fragment();
    expect(f).toMatch(/float atLine = smoothstep\(-[\d.]+, -?[\d.]+, above\)/);
    expect(f).toMatch(/float foam = atLine \*/);
    expect(f).toMatch(/0\.3 \* atLine \*/);
  });
});
