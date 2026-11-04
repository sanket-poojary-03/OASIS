import type { ObjectInfo } from '../render/worldObjects';
import type { Check } from '../world/checks';
import { Notices } from './notices';
import { wait } from './wait';

export interface UIHandlers {
  generate(prompt: string): void;
  command(text: string): void;
  confirm(): void;
  cancel(): void;
  director(): void;
  /** Leave the current world for the start screen (HUD button or N). */
  newWorld(): void;
}

const EXAMPLES = [
  'A misty pine valley with a river, a small fishing village on the bank and an old watchtower on the highest hill',
  'A red desert canyon with an oasis camp, a weathered obelisk on the highest mesa, at sunset',
  'Frozen mountains at night with a castle on the tallest peak and a hunter’s lodge by a lake',
  'A tropical island with a beach village, a lighthouse on the east coast and lots of birds',
];

/** The tilted line by the logo, one per visit. */
const SPLASHES = [
  'Type a world into being!',
  'Every tower is unique!',
  'Walk in seconds later!',
  'Ask for anything!',
  'Now with skylines!',
  'Rivers find their own way!',
  'The car is parked by you!',
  'Change it while you play!',
];

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
  private readonly busy = el('div', 'busy hidden');
  private readonly busyText = el('div', 'busy-text');
  private readonly busyBrief = el('div', 'busy-brief hidden');
  private readonly logList = el('ul', 'log');
  private readonly hud = el('div', 'hud hidden');
  private readonly hint = el('div', 'hint hidden');
  private readonly card = el('div', 'card hidden');
  private readonly command = el('div', 'command hidden');
  private readonly commandInput = el('input', 'command-input');
  private readonly preview = el('div', 'preview hidden');
  private readonly checks = el('div', 'checks hidden');
  private readonly source = el('div', 'source');
  private readonly toastEl = el('div', 'toast hidden');
  private readonly fuel = el('div', 'fuel hidden');
  private readonly fuelFill = el('div', 'fuel-fill');
  private readonly back = el('button', 'secondary hidden', 'Back to my world');
  /** Top-right progress notices (models loading for places added while playing). */
  readonly notices = new Notices();
  private toastTimer = 0;

  constructor(root: HTMLElement, private readonly h: UIHandlers) {
    // start screen: floats over a world turning behind it (App.showcase), like a game's title screen
    const logo = el('div', 'logo');
    logo.append(el('h1', 'logo-word', 'OASIS'), el('span', 'splash', SPLASHES[Math.floor(Math.random() * SPLASHES.length)]));
    const head = el('div', 'start-head');
    head.append(logo, el('p', 'subtitle', 'PROMPT  ·  WORLD  ·  PLAY'), el('p', 'tagline', 'Describe a world. Walk into it. Change it by talking to it.'));
    this.start.append(el('div', 'start-vignette'), head);
    this.prompt.placeholder = 'Describe your world…';
    this.prompt.maxLength = 600;
    this.prompt.value = EXAMPLES[0];
    const chips = el('div', 'chips');
    for (const ex of EXAMPLES) {
      const chip = el('button', 'chip', `${ex.slice(0, 42)}…`);
      chip.onclick = () => { this.prompt.value = ex; };
      chips.append(chip);
    }
    const go = el('button', 'primary', 'Create world');
    go.onclick = () => { if (this.prompt.value.trim().length >= 3) h.generate(this.prompt.value.trim()); };
    const demo = el('button', 'secondary', '▶ Watch the demo');
    demo.onclick = () => h.director();
    this.back.onclick = () => { this.showStart(false); this.showHud(true); };
    const actions = el('div', 'actions');
    actions.append(go, demo, this.back);
    const panel = el('div', 'start-panel');
    panel.append(this.prompt, actions, chips);
    const foot = el('div', 'start-foot');
    foot.append(this.healthLine, el('div', 'credit', 'Behind this menu: a hand-made showcase world, built live by the OASIS engine · Victoria VR AI Builder Hackathon 2026'));
    this.start.append(panel, foot);
    // busy overlay
    this.busy.append(this.busyText, this.busyBrief, this.logList);
    // hud
    const newWorld = el('button', 'secondary new-world', 'New world (N)');
    newWorld.onclick = () => { newWorld.blur(); h.newWorld(); };
    this.hud.append(
      el('div', 'crosshair', '+'),
      el('div', 'help', 'WASD move · Shift run · Space jump/swim (hold in air: rocket booster) · E use / drive · T talk to the world · V camera · B character · U undo · C checks · N new world'),
      this.source, newWorld, this.fuel,
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
    root.append(this.start, this.busy, this.hud, this.hint, this.card, this.command, this.preview, this.checks, this.toastEl, this.notices.root);
  }

  get commandOpen(): boolean { return !this.command.classList.contains('hidden'); }
  get previewOpen(): boolean { return !this.preview.classList.contains('hidden'); }
  get startOpen(): boolean { return !this.start.classList.contains('hidden'); }

  showStart(show: boolean): void {
    this.start.classList.toggle('hidden', !show);
    if (!show) { blurWithin(this.start); this.back.classList.add('hidden'); }
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

  setBusy(text: string | null): void {
    this.busy.classList.toggle('hidden', text === null);
    if (text !== null) this.busyText.textContent = text;
    else { this.logList.replaceChildren(); this.setBrief(null); }
  }

  /** The AI's world brief while the world is built from it (model-written: textContent only). */
  setBrief(brief: { title?: string; brief: string } | null): void {
    this.busyBrief.classList.toggle('hidden', !brief?.brief);
    this.busyBrief.replaceChildren();
    if (!brief?.brief) return;
    if (brief.title) this.busyBrief.append(el('div', 'busy-brief-title', brief.title));
    this.busyBrief.append(el('p', 'busy-brief-text', brief.brief));
  }

  log(line: string): void {
    this.logList.append(el('li', '', line));
  }

  showHud(show: boolean): void { this.hud.classList.toggle('hidden', !show); }

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
  setSource(text: string): void { this.source.textContent = text; }

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
