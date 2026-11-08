import '@fontsource-variable/rubik/wght.css';
import './styles.css';
import { LLM_UNAVAILABLE } from './api/client';
import { wakeBackend } from './api/wake';
import { App } from './app';
import { runDirector } from './logic/director';
import { applyResolution, loadResolution, saveResolution } from './render/resolution';
import { MENU_BEATS, showcaseRecipe } from './ui/showcase';
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
  console.error('OASIS could not start', e);
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = 'WebGL is required to run OASIS. Please try an up-to-date Chrome, Edge or Firefox with hardware acceleration turned on.';
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
  /** localStorage itself can throw when site data is blocked. */
  const storage = (() => { try { return localStorage; } catch { return null; } })();
  const resolution = loadResolution(storage);
  applyResolution(app.engine.scale, resolution, devicePixelRatio);
  const ui = new UI(root, {
    resolution,
    chooseResolution: (choice) => { applyResolution(app.engine.scale, choice, devicePixelRatio); saveResolution(storage, choice); },
    renderRatio: () => app.engine.scale.ratio,
    generate: (prompt) => void app.generate(prompt),
    command: (text) => void app.command(text),
    confirm: () => app.confirm(),
    cancel: () => app.cancel(),
    director: () => void runDirector(app, ui),
    newWorld,
    releaseMouse: () => app.player.controls.unlock(),
  });
  app.ui = ui;
  ui.showStart(true);
  // Behind the start screen a real world turns slowly.
  app.showcase(showcaseRecipe(), MENU_BEATS);
  // Wake a sleeping backend (I8). Once it answers: forget remembered asset misses and load the pack art concurrently.
  // If it wakes only after these pings, the first world/edit answer does the same (App.backendAnswered, I6).
  void wakeBackend((h, final) => {
    if (!h && app.backendOnline) return; // a world/edit answer already proved it is up
    const llm = h?.provider === 'live';
    ui.setHealth(llm ? '' : final ? LLM_UNAVAILABLE : 'Waking the AI server…');
    if (final && !llm) ui.toast(LLM_UNAVAILABLE);
  }).then((h) => {
    if (h?.ok) app.backendAnswered();
  });
  canvas.addEventListener('click', () => {
    if (app.built && !app.spawning && !app.busy && !ui.startOpen && !ui.commandOpen && !ui.previewOpen && !ui.tutorial.isOpen && !app.cinematic) app.player.controls.lock();
  });
  addEventListener('keydown', (e) => {
    if (!app.built || app.cinematic || app.busy || ui.startOpen || ui.tutorial.isOpen || uiOwnsKey(e, root)) return;
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
    else if (e.code === 'KeyH') ui.tutorial.open();
    else if (e.code === 'KeyR') ui.resolution.toggle();
  });
  (window as unknown as { app: App }).app = app;
})();
