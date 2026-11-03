import type { LoadingEvent } from '../render/worldObjects';

const DONE_MS = 2600;

function el(cls: string, text?: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text; // labels are model-written: textContent only
  return e;
}

/**
 * Top-right stack of progress notices, one per place being loaded while playing: a spinner while its 3D model is
 * found and downloaded, then a tick (or a note that a simple shape stands in), fading out after a moment.
 */
export class Notices {
  readonly root = el('notices');
  private readonly items = new Map<string, { box: HTMLDivElement; timer: number }>();

  /** Shows a place's loading progress; the same place updates its notice in place. */
  loading(e: LoadingEvent): void {
    const name = `“${e.label}”`;
    if (e.state === 'cancelled') { this.remove(e.placeId); return; }
    if (e.state === 'loading') this.show(e.placeId, 'spin', `Loading ${name}`, 'finding a 3D model…', false);
    else if (e.state === 'ready') this.show(e.placeId, 'ok', `${name} is here`, '', true);
    else this.show(e.placeId, 'miss', `No 3D model found for ${name}`, 'showing a simple shape instead', true);
  }

  private show(key: string, icon: 'spin' | 'ok' | 'miss', title: string, detail: string, done: boolean): void {
    const old = this.items.get(key);
    if (old) clearTimeout(old.timer);
    const box = old?.box ?? el('notice');
    const text = el('notice-text');
    text.append(el('notice-title', title));
    if (detail) text.append(el('notice-detail', detail));
    box.replaceChildren(el(`notice-icon ${icon}`, icon === 'ok' ? '✓' : icon === 'miss' ? '!' : undefined), text);
    box.classList.toggle('done', done);
    if (!old) this.root.append(box);
    const timer = done ? window.setTimeout(() => this.remove(key), DONE_MS) : 0;
    this.items.set(key, { box, timer });
  }

  private remove(key: string): void {
    const item = this.items.get(key);
    if (!item) return;
    clearTimeout(item.timer);
    this.items.delete(key);
    item.box.classList.add('leaving');
    window.setTimeout(() => item.box.remove(), 300);
  }
}
