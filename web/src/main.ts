import './styles.css';
import { App } from './app';
import { recipeSchema } from './core/recipe';
import { InteractionSystem } from './logic/interactions';
import { Wildlife } from './logic/wildlife';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const app = await App.create(canvas);
  const interactions = new InteractionSystem(app.physics, app.player, app.engine.scene, {
    heightAt: (x, z) => app.built?.field.heightAt(x, z) ?? 0,
    isReady: (x, z) => app.chunks.isReady(x, z),
  });
  app.objects.onReady.push((root, info) => interactions.register(root, info));
  app.objects.onCleared.push(() => interactions.clear());

  const wildlife = new Wildlife(app.engine.scene);
  app.engine.onUpdate((dt, t) => {
    if (app.built) wildlife.update(dt, t, app.player.position, app.built.field, (x, z) => app.chunks.isReady(x, z));
  });

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
    if (e.code !== 'KeyE' || e.repeat || !app.player.controls.isLocked) return;
    const item = interactions.nearest(app.player.lookRay());
    if (item) interactions.use(item);
  });
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  app.load(recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]));
  wildlife.rebuild(app.built!);
  canvas.addEventListener('click', () => app.player.controls.lock());
  (window as unknown as { app: App }).app = app;
})();
