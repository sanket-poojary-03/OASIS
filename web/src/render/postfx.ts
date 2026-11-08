import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Bloom makes lamps, windows, fires and the lighthouse glow at night; OutputPass applies the renderer's tone mapping
 * and exposure (a render target is never tone-mapped by the scene render itself). The scene target is multisampled,
 * because the canvas MSAA does not apply inside a composer; on high-DPI screens (pixel ratio >= 2) it is skipped.
 */
/** How dark it must be (AtmosphereSystem.night) before anything blooms. */
const BLOOM_FROM = 0.5;

export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: renderer.getPixelRatio() >= 2 ? 0 : 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(innerWidth, innerHeight);
    addEventListener('resize', () => this.composer.setSize(innerWidth, innerHeight));
  }

  /** `night` is 0 (day) … 1 (full night), from AtmosphereSystem.night; see `bloomFor`. */
  setNight(night: number | boolean): void {
    const b = bloomFor(typeof night === 'boolean' ? (night ? 1 : 0) : night);
    this.bloom.enabled = b.enabled;
    this.bloom.strength = b.strength;
    this.bloom.threshold = b.threshold;
  }

  render(): void {
    this.composer.render();
  }

  /** Follows the renderer's pixel ratio (Engine.scale). */
  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(innerWidth, innerHeight);
  }
}

/**
 * Bloom is for the dark: emissive windows and the light/fire glows. While the sun is up the only thing above any
 * threshold is the HDR sky around it, which smeared a white haze over the whole picture, dusk and dawn included. So the
 * pass stays off until the sun has gone (night 0.5) and builds up from there. Threshold drops as it gets darker so the
 * softer glows still bloom.
 */
export function bloomFor(night: number): { enabled: boolean; strength: number; threshold: number } {
  const n = Math.min(1, Math.max(0, night));
  const dark = Math.max(0, (n - BLOOM_FROM) / (1 - BLOOM_FROM));
  return { enabled: dark > 0, strength: 0.45 * dark, threshold: 0.9 - 0.2 * dark };
}
