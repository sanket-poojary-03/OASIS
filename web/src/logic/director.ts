import type { App } from '../app';
import type { UI } from '../ui/ui';

/** Stub: Task 25 replaces this with the self-running demo (which must import `wait` from ui/wait.ts). */
export async function runDirector(app: App, ui: UI): Promise<void> {
  await app.generate('A misty pine valley with a river, a small fishing village on the bank, and an old watchtower on the highest hill');
  ui.toast('Demo mode arrives in the next task.');
}
