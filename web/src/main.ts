import './styles.css';
import { wakeBackend } from './api/wake';
import { App } from './app';
import { runDirector } from './logic/director';
import { UI } from './ui/ui';

const editable = (el: unknown): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);

/** Keys typed into a text field (start prompt, command bar) or aimed at a visible, focused UI control are not game keys. */
function uiOwnsKey(e: KeyboardEvent, root: HTMLElement): boolean {
  if (editable(e.target) || editable(document.activeElement)) return true;
  // A hidden control (e.g. "Create world" once the start screen is gone) may keep focus; it must not swallow game keys.
  return e.target instanceof HTMLElement && root.contains(e.target) && e.target.getClientRects().length > 0;
}

/** WebGL (or the physics WebAssembly) is unavailable: say so instead of leaving a blank page (m3). */
function showFatal(root: HTMLElement, e: unknown): void {
  console.error('WorldSeed could not start', e);
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = 'WebGL is required to run WorldSeed. Please try an up-to-date Chrome, Edge or Firefox with hardware acceleration turned on.';
  root.replaceChildren(msg);
}

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const root = document.querySelector<HTMLElement>('#ui')!;
  let app: App;
  try {
    app = await App.create(canvas);
  } catch (e) {
    showFatal(root, e);
    return;
  }
  /** Back to the start screen to describe another world, from the HUD button or N (I7). Never mid-request or mid-demo. */
  const newWorld = (): void => {
    if (!app.built || app.busy || app.cinematic || ui.startOpen) return;
    app.cancel(); // drop a previewed edit
    app.player.controls.unlock();
    ui.showStartOver();
  };
  const ui = new UI(root, {
    generate: (prompt) => void app.generate(prompt),
    command: (text) => void app.command(text),
    confirm: () => app.confirm(),
    cancel: () => app.cancel(),
    director: () => void runDirector(app, ui),
    newWorld,
  });
  app.ui = ui;
  ui.showStart(true);
  // Wake a sleeping backend (I8). Once it answers: forget remembered asset misses and load the pack art concurrently.
  // If it wakes only after these pings, the first non-offline world/edit answer does the same (App.backendAnswered, I6).
  void wakeBackend((h, final) => {
    if (!h && app.backendOnline) return; // a world/edit answer already proved it is up
    ui.setHealth(h ? (h.provider === 'live' ? 'AI online' : 'AI server in mock mode (no API key)')
      : final ? 'Offline mode: preset worlds and basic edits only' : 'Waking the AI server… (offline mode until it answers)');
  }).then((h) => {
    if (h?.ok) app.backendAnswered();
  });
  canvas.addEventListener('click', () => {
    if (app.built && !app.spawning && !app.busy && !ui.startOpen && !ui.commandOpen && !ui.previewOpen && !app.cinematic) app.player.controls.lock();
  });
  addEventListener('keydown', (e) => {
    if (!app.built || app.cinematic || app.busy || ui.startOpen || uiOwnsKey(e, root)) return;
    if (ui.previewOpen) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); app.confirm(); }
      else if (e.code === 'Escape') { e.preventDefault(); app.cancel(); }
      else if (e.code === 'KeyN' && !e.repeat) { e.preventDefault(); newWorld(); }
      return;
    }
    if (ui.commandOpen || e.repeat) return;
    if (e.code === 'KeyT') { e.preventDefault(); app.player.controls.unlock(); ui.openCommand(); }
    else if (e.code === 'KeyN') { e.preventDefault(); newWorld(); }
    else if (e.code === 'KeyE') { if (app.player.controls.isLocked) app.interact(); }
    else if (e.code === 'KeyU') app.undo();
    else if (e.code === 'KeyB') void app.characters.next().then((name) => ui.toast(`Playing as ${name}${app.avatar.thirdPerson ? '' : ' · V to see yourself'}`));
    else if (e.code === 'KeyV') ui.toast(app.avatar.toggle() ? 'Third-person view · V for first person' : 'First-person view');
    else if (e.code === 'KeyC') ui.toggleChecks();
  });
  (window as unknown as { app: App }).app = app;
})();
