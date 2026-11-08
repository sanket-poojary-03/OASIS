import { TUTORIAL_STEPS as STEPS, type TutorialStep } from './tutorialSteps';
import { wait } from './wait';

const OUT_MS = 150;
const IN_MS = 260;
/** Long enough to be noticed while taking in a new world, short enough not to nag someone playing. */
const HIGHLIGHT_MS = 15_000;

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The controls, one at a time: each step leaves before the next arrives, in a card that leaves the world in view. */
export class Tutorial {
  /** Top-right, in the world only. */
  readonly button = el('button', 'secondary tutorial-button', 'Tutorial (H)');
  readonly card = el('div', 'tutorial hidden');
  private readonly slide = el('div', 'tutorial-slide');
  private readonly keys = el('div', 'tutorial-keys');
  private readonly title = el('h2', 'tutorial-title');
  private readonly text = el('p', 'tutorial-text');
  private readonly count = el('div', 'tutorial-count');
  private readonly backButton = el('button', 'secondary', 'Back');
  private readonly nextButton = el('button', 'primary', 'Next');
  private step = 0;
  /** A newer change of step cancels the older one's fade. */
  private change = 0;
  private highlightTimer = 0;

  /** `onOpen` hands the mouse back, so the card's buttons can be clicked. */
  constructor(private readonly onOpen: () => void) {
    this.button.onclick = () => { this.button.blur(); this.open(); };
    const close = el('button', 'tutorial-close', '×');
    close.setAttribute('aria-label', 'Close the tutorial');
    close.onclick = () => this.close();
    this.backButton.onclick = () => this.go(this.step - 1);
    this.nextButton.onclick = () => { if (this.step === STEPS.length - 1) this.close(); else this.go(this.step + 1); };
    this.slide.append(this.keys, this.title, this.text);
    const foot = el('div', 'tutorial-foot');
    const buttons = el('div', 'tutorial-buttons');
    buttons.append(this.backButton, this.nextButton);
    foot.append(this.count, buttons);
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'Tutorial');
    this.slide.setAttribute('aria-live', 'polite');
    this.card.append(close, this.slide, foot);
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.code === 'ArrowRight' && this.step < STEPS.length - 1) { e.preventDefault(); this.go(this.step + 1); }
      else if (e.code === 'ArrowLeft' && this.step > 0) { e.preventDefault(); this.go(this.step - 1); }
    });
  }

  get isOpen(): boolean { return !this.card.classList.contains('hidden'); }

  /** A new world has arrived: draw the eye to the button for a while. Opening the tutorial ends it. */
  highlight(): void {
    this.button.classList.add('highlight');
    clearTimeout(this.highlightTimer);
    this.highlightTimer = window.setTimeout(() => this.button.classList.remove('highlight'), HIGHLIGHT_MS);
  }

  open(): void {
    this.button.classList.remove('highlight');
    clearTimeout(this.highlightTimer);
    this.onOpen();
    this.change++;
    this.step = 0;
    this.card.classList.remove('hidden');
    this.show(STEPS[0]);
    this.appear();
    this.nextButton.focus({ preventScroll: true }); // Enter and Space walk through the steps
  }

  close(): void {
    this.change++;
    this.card.classList.add('hidden');
    const a = document.activeElement;
    if (a instanceof HTMLElement && this.card.contains(a)) a.blur(); // a hidden control must not swallow game keys
  }

  private async go(step: number): Promise<void> {
    if (step < 0 || step >= STEPS.length) return;
    this.step = step;
    const change = ++this.change;
    this.setControls();
    if (!reducedMotion()) {
      this.slide.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: OUT_MS, easing: 'ease-in', fill: 'forwards' });
      await wait(OUT_MS); // a timer: an animation's own promise rejects if it is cancelled, and stalls in a throttled tab
      if (change !== this.change) return; // another step, or closed, while this one was leaving
    }
    this.show(STEPS[step]);
    this.appear();
  }

  private appear(): void {
    this.slide.getAnimations().forEach((a) => a.cancel());
    if (!reducedMotion()) this.slide.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: IN_MS, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  private show(s: TutorialStep): void {
    const wasd = s.keys.length === 4;
    this.keys.classList.toggle('wasd', wasd);
    this.keys.replaceChildren(...s.keys.map((k) => el('kbd', `tutorial-key key-${k.toLowerCase()}`, k)));
    this.title.textContent = s.title;
    this.text.textContent = s.text;
    this.setControls();
  }

  private setControls(): void {
    this.count.textContent = `${this.step + 1} of ${STEPS.length}`;
    this.backButton.classList.toggle('invisible', this.step === 0);
    this.nextButton.textContent = this.step === STEPS.length - 1 ? 'Done' : 'Next';
  }
}
