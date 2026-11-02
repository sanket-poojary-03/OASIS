import './styles.css';
import { health } from './api/client';
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

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const root = document.querySelector<HTMLElement>('#ui')!;
  const app = await App.create(canvas);
  const ui = new UI(root, {
    generate: (prompt) => void app.generate(prompt),
    command: (text) => void app.command(text),
    confirm: () => app.confirm(),
    cancel: () => app.cancel(),
    director: () => void runDirector(app, ui),
  });
  app.ui = ui;
  ui.showStart(true);
  void health().then((h) => {
    // A reachable backend clears remembered asset misses; an unreachable one changes nothing (Render cold starts).
    if (h?.ok) app.models.reset?.();
    ui.setHealth(h ? (h.provider === 'live' ? 'AI online' : 'AI server in mock mode (no API key)') : 'Offline mode: preset worlds and basic edits only');
  });
  canvas.addEventListener('click', () => {
    if (app.built && !app.spawning && !app.busy && !ui.commandOpen && !ui.previewOpen && !app.cinematic) app.player.controls.lock();
  });
  addEventListener('keydown', (e) => {
    if (!app.built || app.cinematic || app.busy || ui.startOpen || uiOwnsKey(e, root)) return;
    if (ui.previewOpen) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); app.confirm(); }
      else if (e.code === 'Escape') { e.preventDefault(); app.cancel(); }
      return;
    }
    if (ui.commandOpen || e.repeat) return;
    if (e.code === 'KeyT') { e.preventDefault(); app.player.controls.unlock(); ui.openCommand(); }
    else if (e.code === 'KeyE') { if (app.player.controls.isLocked) app.interact(); }
    else if (e.code === 'KeyU') app.undo();
    else if (e.code === 'KeyC') ui.toggleChecks();
  });
  (window as unknown as { app: App }).app = app;
})();
