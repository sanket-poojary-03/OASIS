import { pixelSize, ratioOf, RESOLUTIONS, type Resolution } from '../render/resolution';

export interface ResolutionHandlers {
  /** Apply and remember a choice. */
  choose(choice: Resolution): void;
  /** The pixel ratio in use right now (Auto moves it). */
  ratio(): number;
  /** Hands the mouse back, so the menu can be clicked. */
  releaseMouse(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A button above "New world" (top right on the start screen): it opens the list of resolutions, each with its size on this window. */
export class ResolutionMenu {
  readonly root = el('div', 'resolution');
  private readonly button = el('button', 'secondary resolution-button');
  private readonly list = el('div', 'resolution-list hidden');

  constructor(private choice: Resolution, private readonly h: ResolutionHandlers) {
    this.list.setAttribute('role', 'menu');
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.onclick = () => this.toggle();
    this.root.append(this.list, this.button);
    this.label();
    // A click elsewhere closes it, whether it lands on the world or on another button.
    addEventListener('pointerdown', (e) => { if (this.isOpen && !this.root.contains(e.target as Node)) this.close(); });
    addEventListener('keydown', (e) => { if (this.isOpen && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } }, true);
  }

  get isOpen(): boolean { return !this.list.classList.contains('hidden'); }

  toggle(): void {
    if (this.isOpen) { this.close(); return; }
    this.h.releaseMouse();
    this.render();
    this.list.classList.remove('hidden');
  }

  close(): void {
    this.list.classList.add('hidden');
    const a = document.activeElement;
    if (a instanceof HTMLElement && this.root.contains(a)) a.blur(); // a control must not swallow game keys
  }

  private label(): void {
    const name = RESOLUTIONS.find((r) => r.id === this.choice)!.label;
    this.button.replaceChildren(`Resolution: ${name}`, el('span', 'resolution-key', ' (R)')); // R works in a world, not on the start screen
  }

  private render(): void {
    this.list.replaceChildren(...RESOLUTIONS.map(({ id, label }) => {
      const fixed = ratioOf(id, devicePixelRatio);
      const item = el('button', `resolution-item${id === this.choice ? ' chosen' : ''}`);
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(id === this.choice));
      const size = pixelSize(fixed ?? this.h.ratio(), innerWidth, innerHeight);
      item.append(el('span', 'resolution-name', label), el('span', 'resolution-size', fixed === null ? `follows your frame rate, now ${size}` : size));
      item.onclick = () => {
        this.choice = id;
        this.h.choose(id);
        this.label();
        this.close();
      };
      return item;
    }));
  }
}
