import type { App } from '../app';
import type { UI } from '../ui/ui';
import { wait } from '../ui/wait';

const PROMPT = 'A misty pine valley with a river, a small fishing village on the bank, and an old stone watchtower on the highest hill. Dawn, light fog, deer in the woods.';

let running = false;

/** A self-running ~70 s demo through the real pipeline: prompt → world → reasons → live edits, ending on a clear day. Esc stops it. */
export async function runDirector(app: App, ui: UI): Promise<void> {
  if (running) return;
  running = true;
  let stopped = false;
  const onKey = (e: KeyboardEvent): void => { if (e.code === 'Escape') stopped = true; };
  addEventListener('keydown', onKey);
  /** Waits `ms` in short slices so Esc takes effect quickly; true when the demo should stop. */
  const pause = async (ms: number): Promise<boolean> => {
    for (let t = 0; t < ms && !stopped; t += 250) await wait(Math.min(250, ms - t));
    return stopped;
  };
  try {
    await ui.typeStart(PROMPT);
    if (stopped) return;
    const ok = await app.generate(PROMPT);
    if (stopped || !ok || !app.built) return; // Esc while the world was being built stops the demo there
    const b = app.built;
    const village = b.placements.find((p) => p.kind === 'settlement') ?? b.placements[0];
    if (!village) return;
    const tower = b.placements.find((p) => p.kind === 'landmark') ?? village;
    app.cinematic = { x: village.x, y: village.y, z: village.z, radius: village.radius + 35, height: 22, speed: 0.12 };
    ui.toast(`The AI placed the village: ${village.reasons.join(', ')}`);
    if (await pause(7000)) return;
    app.cinematic = { x: tower.x, y: tower.y, z: tower.z, radius: 45, height: 18, speed: 0.15 };
    ui.toast(`The tower: ${tower.reasons.join(', ')}`);
    if (await pause(6000)) return;
    const steps: Array<[string, { x: number; z: number } | undefined]> = [
      ['make it night', undefined],
      ['put a lighthouse here', { x: village.x + village.radius + 25, z: village.z }],
      ['make it snow', undefined],
      ['make it a clear day', undefined], // end in daylight, so the viewer takes over a bright world
    ];
    app.cinematic = { x: village.x, y: village.y, z: village.z, radius: village.radius + 45, height: 26, speed: 0.1 };
    for (const [text, look] of steps) {
      if (stopped) return;
      await ui.typeCommand(text);
      await app.command(text, look); // ignored by App when busy; a failed step just toasts and the next one runs
      if (await pause(1600)) return;
      app.confirm();
      if (await pause(5500)) return;
    }
    ui.toast('Your turn: click to walk, E to use things, T to talk to the world.');
  } catch (e) {
    console.error('director stopped', e);
  } finally {
    removeEventListener('keydown', onKey);
    app.cancel(); // drop any preview left open by a stopped step
    app.cinematic = null;
    running = false;
  }
}
