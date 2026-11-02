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

  /**
   * `night` is 0 (day) … 1 (full night), from AtmosphereSystem.night. At night the bloom is stronger and its threshold
   * lower, so emissive windows and the light/fire glows (which sit below the day threshold) glow softly.
   */
  setNight(night: number | boolean): void {
    const n = typeof night === 'boolean' ? (night ? 1 : 0) : Math.min(1, Math.max(0, night));
    this.bloom.strength = 0.25 + 0.65 * n;
    this.bloom.threshold = 0.85 - 0.3 * n;
  }

  render(): void {
    this.composer.render();
  }
}
