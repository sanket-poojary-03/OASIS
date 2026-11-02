import './styles.css';
import { App } from './app';
import { recipeSchema } from './core/recipe';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const app = await App.create(canvas);
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  app.load(recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]));
  canvas.addEventListener('click', () => app.player.controls.lock());
  (window as unknown as { app: App }).app = app;
})();
