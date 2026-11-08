import { MODE_FRAMES, paintFrame, resolvePreset } from 'thinking-orbs/engine';
import { busyWord, type BusyStage } from './busyWords';

/** The "composing" orb, an undulating sash, at the size its dots are tuned for. */
const ORB_STATE = 'composing';
const ORB_SIZE = 64;
/** Electric blue, on the box's white: the engine fades a dot's faint end towards white. */
const ORB_TINT = { r: 10, g: 107, b: 255 };
const WORD_EVERY_MS = 2000;
/** The held frame is blurred, so it needs few pixels. */
const HELD_WIDTH = 640;
const HELD_FADE_MS = 700;

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The orb, drawn with the thinking-orbs engine (MIT, Jakub Antalik): plain 2D canvas, and its engine has no React in it. */
class Orb {
  readonly canvas = document.createElement('canvas');
  private raf = 0;
  private readonly preset = resolvePreset(ORB_STATE, ORB_SIZE);

  constructor() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.className = 'busy-orb';
    this.canvas.width = this.canvas.height = Math.round(ORB_SIZE * dpr);
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  private draw(seconds: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = this.canvas.width / ORB_SIZE;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);
    paintFrame(ctx, MODE_FRAMES[this.preset.mode](ORB_SIZE, seconds, this.preset.opts), false, ORB_TINT);
  }

  start(): void {
    this.stop();
    if (reducedMotion()) { this.draw(0.6); return; } // the engine's own representative still frame
    const loop = () => {
      this.draw((performance.now() / 1000) * this.preset.speed);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}

/**
 * What shows while the app works: a white box over the live world, with an orb and a word that changes. The
 * world stays in view the whole time; `hold` covers only the moment one world is swapped for the next.
 */
export class BusyPill {
  readonly root = document.createElement('div');
  /** The last frame of the old world, blurred, so the player never sees the new one half loaded. */
  readonly held = document.createElement('canvas');
  private readonly orb = new Orb();
  private readonly label = document.createElement('div');
  private readonly word = document.createElement('span');
  private stage: BusyStage | null = null;
  private step = 0;
  private timer = 0;
  private fadeTimer = 0;

  constructor() {
    this.root.className = 'busy hidden';
    this.root.setAttribute('role', 'status');
    this.held.className = 'busy-held hidden';
    this.held.setAttribute('aria-hidden', 'true');
    this.label.className = 'busy-label';
    this.word.className = 'busy-word';
    this.word.setAttribute('aria-hidden', 'true');
    this.label.append(this.word);
    this.root.append(this.orb.canvas, this.label);
  }

  show(stage: BusyStage): void {
    if (stage === this.stage) return;
    const wasHidden = this.stage === null;
    this.stage = stage;
    this.step = 0;
    this.root.classList.remove('hidden');
    this.root.setAttribute('aria-label', `${busyWord(stage, 0)}…`); // for screen readers: the stage, not every passing word
    this.setWord(busyWord(stage, 0), !wasHidden);
    if (wasHidden) this.orb.start();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (this.stage) this.setWord(busyWord(this.stage, ++this.step), true);
    }, WORD_EVERY_MS);
  }

  hide(): void {
    this.stage = null;
    clearInterval(this.timer);
    this.orb.stop();
    this.root.classList.add('hidden');
    this.release();
  }

  /** Freezes what `source` shows now: call straight after rendering to it, since the canvas clears after a frame. */
  hold(source: HTMLCanvasElement): void {
    if (source.width === 0 || source.height === 0) return; // a hidden window has nothing to hold, and must not lose the world
    clearTimeout(this.fadeTimer);
    this.held.width = HELD_WIDTH;
    this.held.height = Math.round((HELD_WIDTH * source.height) / Math.max(1, source.width));
    this.held.getContext('2d')?.drawImage(source, 0, 0, this.held.width, this.held.height);
    this.held.classList.remove('hidden', 'leaving');
  }

  private release(): void {
    if (this.held.classList.contains('hidden')) return;
    this.held.classList.add('leaving');
    clearTimeout(this.fadeTimer);
    this.fadeTimer = window.setTimeout(() => this.held.classList.add('hidden'), HELD_FADE_MS);
  }

  /** Changes the word, and eases the pill to its new width rather than letting it jump. */
  private setWord(text: string, animate: boolean): void {
    this.word.textContent = `${text}…`;
    this.label.style.width = `${this.word.offsetWidth}px`;
    if (animate && !reducedMotion()) {
      this.word.animate([{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }
}
