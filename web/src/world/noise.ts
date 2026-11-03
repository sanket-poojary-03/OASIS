import type { NoiseFunction2D } from 'simplex-noise';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Fractal Brownian motion, normalized to [-1, 1]. */
export function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number, gain = 0.5, lacunarity = 2): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged multifractal in [0, 1] for mountains. Each octave's crest is rounded a little more than the one before
 * (`soft` grows by `soft` per octave): the main ridgelines stay crisp while fine detail can never fold into needle peaks
 * or saw-tooth crests at the 2 m mesh scale. Each octave is weighted by the one before it, so detail grows on ridges
 * and valleys stay smooth.
 */
export function ridged(noise: NoiseFunction2D, x: number, z: number, octaves: number, soft = 0.06, gain = 0.45): number {
  let amp = 1, freq = 1, sum = 0, norm = 0, weight = 1;
  for (let i = 0; i < octaves; i++) {
    const k = soft * (i + 1);
    const n = noise(x * freq, z * freq);
    const crest = (1 - Math.sqrt(n * n + k * k)) / (1 - k);
    const r = crest * crest;
    sum += r * amp * weight;
    norm += amp;
    weight = clamp(r * 1.25, 0, 1);
    amp *= gain;
    freq *= 2;
  }
  return clamp(sum / norm, 0, 1);
}
