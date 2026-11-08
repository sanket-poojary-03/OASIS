import type { ObjectInfo } from '../render/worldObjects';
import type { Check } from '../world/checks';
import { BusyPill } from './busy';
import type { BusyStage } from './busyWords';
import { Notices } from './notices';
import { HINT_LEAD, promptHint } from './promptHint';
import { ResolutionMenu, type ResolutionHandlers } from './resolutionMenu';
import type { Resolution } from '../render/resolution';
import { Tutorial } from './tutorial';
import { wait } from './wait';

export interface UIHandlers {
  generate(prompt: string): void;
  command(text: string): void;
  confirm(): void;
  cancel(): void;
  director(): void;
  /** Leave the current world for the start screen (HUD button or N). */
  newWorld(): void;
  /** Hand the mouse back, so a panel can be clicked. */
  releaseMouse(): void;
  /** The saved resolution at start-up, then each new choice and the ratio in use. */
  resolution: Resolution;
  chooseResolution: ResolutionHandlers['choose'];
  renderRatio: ResolutionHandlers['ratio'];
}

const HINT_EVERY_MS = 50;

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A hidden control must not keep keyboard focus (it would swallow game keys). */
function blurWithin(container: HTMLElement): void {
  const a = document.activeElement;
  if (a instanceof HTMLElement && container.contains(a)) a.blur();
}

export class UI {
  private readonly start = el('div', 'start');
  private readonly prompt = el('textarea', 'prompt-input');
  private readonly healthLine = el('div', 'health');
  private readonly busy = new BusyPill();
  private readonly hud = el('div', 'hud hidden');
  private readonly hint = el('div', 'hint hidden');
  private readonly card = el('div', 'card hidden');
  private readonly command = el('div', 'command hidden');
  private readonly commandInput = el('input', 'command-input');
  private readonly preview = el('div', 'preview hidden');
  private readonly checks = el('div', 'checks hidden');
  private readonly toastEl = el('div', 'toast hidden');
  private readonly fuel = el('div', 'fuel hidden');
  private readonly fuelFill = el('div', 'fuel-fill');
  private readonly back = el('button', 'secondary hidden', 'Back to my world');
  /** Top-right progress notices (models loading for places added while playing). */
  readonly notices = new Notices();
  readonly tutorial: Tutorial;
  readonly resolution: ResolutionMenu;
  private toastTimer = 0;
  private hintTimer = 0;
  private welcomed = false;

  constructor(root: HTMLElement, private readonly h: UIHandlers) {
    this.tutorial = new Tutorial(() => h.releaseMouse());
    this.resolution = new ResolutionMenu(h.resolution, { choose: h.chooseResolution, ratio: h.renderRatio, releaseMouse: h.releaseMouse });
    // start screen: floats over a world turning behind it (App.showcase), like a game's title screen
    const logoImg = el('img');
    logoImg.src = '/oasis-logo.webp';
    logoImg.alt = 'OASIS';
    logoImg.width = 1474;
    logoImg.height = 755;
    logoImg.draggable = false;
    const logo = el('h1', 'logo-word');
    logo.append(logoImg);
    const head = el('div', 'start-head');
    const tagline = el('p', 'tagline');
    for (const line of ['Describe a world.', 'Walk into it.', 'Change it by talking to it.']) tagline.append(el('span', undefined, line));
    head.append(logo, tagline);
    this.start.append(head);
    this.prompt.placeholder = HINT_LEAD;
    this.prompt.setAttribute('aria-label', 'Describe your world');
    this.prompt.maxLength = 600;
    const go = el('button', 'primary', 'Create world');
    go.onclick = () => {
      if (this.prompt.value.trim().length >= 3) h.generate(this.prompt.value.trim());
      else this.prompt.focus(); // the box starts empty, so this click is asking where to type
    };
    const demo = el('button', 'secondary', 'Watch the demo');
    demo.onclick = () => h.director();
    this.back.onclick = () => { this.showStart(false); this.showHud(true); };
    const actions = el('div', 'actions');
    actions.append(go, demo, this.back);
    const panel = el('div', 'start-panel');
    panel.append(this.healthLine, this.prompt, actions);
    this.start.append(panel, this.resolution.root); // one menu: it moves to the HUD when a world opens (showHud)
    // hud
    const newWorld = el('button', 'secondary new-world', 'New world (N)');
    newWorld.onclick = () => { newWorld.blur(); h.newWorld(); };
    this.hud.append(
      el('div', 'crosshair', '+'),
      newWorld, this.fuel,
    );
    this.fuel.append(el('div', 'fuel-label', 'BOOST'), el('div', 'fuel-bar'));
    this.fuel.lastElementChild!.append(this.fuelFill);
    // command bar
    this.commandInput.placeholder = 'Tell the world what to change… e.g. “make it night”, “put a lighthouse there”';
    this.commandInput.maxLength = 400;
    this.commandInput.onkeydown = (e) => {
      if (e.key === 'Enter' && this.commandInput.value.trim()) { const v = this.commandInput.value.trim(); this.closeCommand(); h.command(v); }
      if (e.key === 'Escape') this.closeCommand();
      e.stopPropagation();
    };
    this.command.append(this.commandInput);
    root.append(this.busy.held, this.start, this.busy.root, this.hud, this.hint, this.card, this.command, this.preview, this.checks, this.toastEl, this.notices.root, this.tutorial.button, this.tutorial.card);
  }

  get commandOpen(): boolean { return !this.command.classList.contains('hidden'); }
  get previewOpen(): boolean { return !this.preview.classList.contains('hidden'); }
  get startOpen(): boolean { return !this.start.classList.contains('hidden'); }

  showStart(show: boolean): void {
    this.start.classList.toggle('hidden', !show);
    if (show) this.moveResolution(this.start);
    if (!show) { blurWithin(this.start); this.back.classList.add('hidden'); }
    // The controls only mean something in a world, so the tutorial waits for one.
    this.tutorial.button.classList.toggle('hidden', show);
    if (show) this.tutorial.close();
    this.animateHint(show);
  }

  /** The prompt box's placeholder types out ideas while the start screen is open. */
  private animateHint(on: boolean): void {
    clearInterval(this.hintTimer);
    if (!on || reducedMotion()) return;
    const from = performance.now();
    this.hintTimer = window.setInterval(() => { this.prompt.placeholder = promptHint(performance.now() - from); }, HINT_EVERY_MS);
  }

  /** The start screen over a running world (I7): HUD and panels step aside, and "Back to my world" returns to it. */
  showStartOver(): void {
    this.closeCommand();
    this.hidePreview();
    this.setHint(null);
    this.setCard(null);
    this.checks.classList.add('hidden');
    this.showHud(false);
    this.back.classList.remove('hidden');
    this.showStart(true);
  }
  /** Booster fuel (0..1): shown while firing or refilling, hidden when full. */
  setFuel(fuel: number, firing: boolean): void {
    this.fuel.classList.toggle('hidden', fuel >= 1 && !firing);
    this.fuel.classList.toggle('low', fuel < 0.2);
    this.fuelFill.style.width = `${Math.round(fuel * 100)}%`;
  }

  setHealth(text: string): void { this.healthLine.textContent = text; }

  /** A pill over the live world, or nothing. The start screen steps aside for it, so the world shows; it comes back on failure. */
  setBusy(stage: BusyStage | null): void {
    if (stage) this.busy.show(stage);
    else this.busy.hide();
    this.start.classList.toggle('building', stage !== null);
    if (stage) this.tutorial.close();
    if (stage) blurWithin(this.start);
  }

  /** Keeps the current picture on screen while one world is swapped for the next; setBusy(null) fades it away. */
  holdFrame(source: HTMLCanvasElement): void {
    this.busy.hold(source);
  }

  showHud(show: boolean): void {
    this.hud.classList.toggle('hidden', !show);
    if (show) this.moveResolution(this.hud);
    else this.resolution.close();
    // The controls live in the tutorial now, so a new player needs one pointer to it, and to the click that takes control.
    if (show && !this.welcomed) { this.welcomed = true; this.toast('Click the world to play. Press H for the controls.'); }
  }

  /** The resolution menu sits on whichever screen is up: the start screen, or the HUD in a world. */
  private moveResolution(to: HTMLElement): void {
    if (this.resolution.root.parentElement === to) return;
    this.resolution.close();
    to.append(this.resolution.root);
  }

  setHint(text: string | null): void {
    this.hint.classList.toggle('hidden', text === null);
    if (text) this.hint.textContent = text;
  }

  setCard(info: ObjectInfo | null): void {
    this.card.classList.toggle('hidden', info === null);
    if (!info) return;
    const BADGE = { placeholder: 'procedural model', library: 'CC0 library model', online: 'free model found online', generated: 'AI-generated model', procedural: 'building designed in code' } as const;
    const badge = el('span', `badge ${info.source}`, BADGE[info.source]);
    const children: HTMLElement[] = [el('h3', '', info.label), badge];
    if (info.description) children.push(el('p', '', info.description));
    if (info.reasons.length) children.push(el('p', 'why', `Why here: ${info.reasons.join(', ')}`));
    if (info.warnings.length) children.push(el('p', 'warn', `Note: ${info.warnings.join('; ')}`));
    if (info.credit) children.push(el('p', 'why', `Model: ${info.credit}`));
    this.card.replaceChildren(...children);
  }

  openCommand(): void {
    this.command.classList.remove('hidden');
    this.commandInput.value = '';
    setTimeout(() => this.commandInput.focus(), 0);
  }

  closeCommand(): void {
    this.command.classList.add('hidden');
    blurWithin(this.command);
  }

  showPreview(lines: string[], notes: string[]): void {
    const list = el('ul');
    for (const l of lines) list.append(el('li', '', l));
    const children: HTMLElement[] = [el('h3', '', 'Proposed change'), list];
    for (const n of notes) children.push(el('p', 'note', n));
    children.push(el('p', 'keys', 'Enter to apply · Esc to cancel'));
    this.preview.replaceChildren(...children);
    this.preview.classList.remove('hidden');
  }

  hidePreview(): void { this.preview.classList.add('hidden'); }

  setChecks(checks: Check[]): void {
    const list = el('ul');
    for (const c of checks) {
      const li = el('li', c.status, `${c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗'} ${c.label}`);
      li.title = c.detail;
      list.append(li);
    }
    this.checks.replaceChildren(el('h3', '', 'World checks'), list);
  }

  toggleChecks(): void { this.checks.classList.toggle('hidden'); }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 4500);
  }

  async typeStart(text: string): Promise<void> {
    this.prompt.value = '';
    for (const ch of text) { this.prompt.value += ch; await wait(18); }
    await wait(400);
  }

  async typeCommand(text: string): Promise<void> {
    this.command.classList.remove('hidden');
    this.commandInput.value = '';
    for (const ch of text) { this.commandInput.value += ch; await wait(45); }
    await wait(500);
    this.closeCommand();
  }
}
