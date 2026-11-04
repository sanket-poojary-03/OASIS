/**
 * Adaptive render resolution. A forest or city at 1080p is fill-bound on integrated GPUs (an Iris Xe: 37–44 fps at
 * full resolution, 50 at 0.85, 58 at 0.75), so every 2 s of frames the pixel ratio steps down while the frame rate is
 * under 45 fps, and back up a little after three windows near the display's cap. Fast GPUs never leave full resolution.
 * A step down that gains under 3 fps is undone and the scale holds for 20 s: those frames are slow for another reason
 * (terrain streaming while sprinting, a startup load), and a blurrier picture would not help them.
 */
export const LOW_FPS = 45;
export const HIGH_FPS = 57;
const WINDOW_S = 2;
const STEP_DOWN = 0.1;
const STEP_UP = 0.05;
const MIN_GAIN = 3;
const HOLD_WINDOWS = 10;

export class RenderScale {
  ratio: number;
  private elapsed = 0;
  private frames = 0;
  private good = 0;
  /** The frame rate before the last step down (to judge whether it helped), and windows left to hold still. */
  private before = 0;
  private hold = 0;

  constructor(readonly max: number, private readonly apply: (ratio: number) => void, readonly min = Math.min(0.6, max)) {
    this.ratio = max;
  }

  /** One frame's real duration in seconds. Hitches over 0.5 s (a hidden tab, a shader compile) are not samples. */
  sample(dt: number): void {
    if (!(dt > 0) || dt > 0.5) return;
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < WINDOW_S) return;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    if (this.before > 0) {
      const gain = fps - this.before;
      this.before = 0;
      if (gain < MIN_GAIN) { this.set(this.ratio + STEP_DOWN); this.hold = HOLD_WINDOWS; return; }
    }
    if (this.hold > 0) { this.hold--; return; }
    if (fps < LOW_FPS && this.ratio > this.min) { this.before = fps; this.set(this.ratio - STEP_DOWN); this.good = 0; }
    else if (fps > HIGH_FPS && this.ratio < this.max) { if (++this.good >= 3) { this.set(this.ratio + STEP_UP); this.good = 0; } }
    else this.good = 0;
  }

  private set(ratio: number): void {
    this.ratio = Math.min(this.max, Math.max(this.min, Math.round(ratio * 100) / 100));
    this.apply(this.ratio);
  }
}
