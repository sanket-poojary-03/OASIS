import * as THREE from 'three';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 6000);
  /** When set (PostFX: bloom + tone mapping), frames go through it instead of a direct render. */
  postfx: { render(): void } | null = null;
  private readonly timer = new THREE.Timer();
  private readonly updaters: Array<(dt: number, t: number) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false } /* every frame goes through PostFX, whose scene target is multisampled */);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  onUpdate(fn: (dt: number, t: number) => void): () => void {
    this.updaters.push(fn);
    return () => { const i = this.updaters.indexOf(fn); if (i >= 0) this.updaters.splice(i, 1); };
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /**
   * One frame. A throwing updater or render is caught (and logged once per distinct error), so one bad frame or system
   * never freezes the whole app: the other updaters and the render still run.
   */
  tick(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    for (const u of this.updaters) {
      try { u(dt, t); } catch (e) { warnOnce('frame update', e); }
    }
    try {
      if (this.postfx) this.postfx.render(); else this.renderer.render(this.scene, this.camera);
    } catch (e) { warnOnce('render', e); }
  }
}

const warned = new Set<string>();
/** console.warn once per distinct error (a per-frame error would otherwise flood the console). */
export function warnOnce(where: string, e: unknown): void {
  const key = `${where}: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`;
  if (warned.has(key) || warned.size >= 50) return;
  warned.add(key);
  console.warn(`[engine] ${where} failed; the app keeps running (this error is logged once)`, e);
}
