import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

const TAU = Math.PI * 2;
const WAVES = 48;
/** Higher means steeper ripples. */
const STEEPNESS = 0.4;

/**
 * A tiling normal map of ripples as RGBA bytes: many sine waves with whole-number frequencies, so opposite edges match,
 * and amplitude falling with frequency. Generated rather than loaded, so the project ships no image of unknown licence.
 */
export function rippleNormals(size: number): Uint8Array {
  const rng = mulberry32(7);
  const waves: Array<{ fx: number; fy: number; phase: number; amp: number }> = [];
  for (let i = 0; i < WAVES; i++) {
    const f = 2 + Math.pow(rng(), 1.6) * 38, a = rng() * TAU;
    const fx = Math.round(Math.cos(a) * f), fy = Math.round(Math.sin(a) * f);
    if (fx === 0 && fy === 0) continue;
    waves.push({ fx, fy, phase: rng() * TAU, amp: 1 / Math.hypot(fx, fy) });
  }
  const norm = STEEPNESS / Math.sqrt(waves.length);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos((TAU * (w.fx * x + w.fy * y)) / size + w.phase) * w.amp;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      const nx = dx * norm, ny = dy * norm, len = Math.hypot(nx, ny, 1), k = (x + y * size) * 4;
      data[k] = Math.round((nx / len) * 127.5 + 127.5);
      data[k + 1] = Math.round((ny / len) * 127.5 + 127.5);
      data[k + 2] = Math.round((1 / len) * 127.5 + 127.5);
      data[k + 3] = 255;
    }
  }
  return data;
}

export function rippleTexture(size = 256): THREE.DataTexture {
  const tex = new THREE.DataTexture(rippleNormals(size), size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
