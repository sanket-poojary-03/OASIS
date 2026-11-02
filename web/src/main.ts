import './styles.css';
import { App } from './app';
import { recipeSchema } from './core/recipe';
import { InteractionSystem } from './logic/interactions';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const app = await App.create(canvas);
  const interactions = new InteractionSystem(app.physics, app.player);
  app.objects.onReady.push((root, info) => interactions.register(root, info));
  app.objects.onCleared.push(() => interactions.clear());

  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:rgba(11,16,32,.7);font-size:14px;display:none;pointer-events:none';
  document.querySelector('#ui')!.append(hint);

  app.engine.onUpdate((dt, t) => {
    interactions.update(dt, app.atmosphere.isNight, t);
    const item = app.player.controls.isLocked ? interactions.nearest(app.player.lookRay()) : null;
    hint.textContent = item ? interactions.hint(item) : '';
    hint.style.display = item ? 'block' : 'none';
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !app.player.controls.isLocked) return;
    const item = interactions.nearest(app.player.lookRay());
    if (item) interactions.use(item);
  });
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  app.load(recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]));
  canvas.addEventListener('click', () => app.player.controls.lock());
  (window as unknown as { app: App }).app = app;
})();
