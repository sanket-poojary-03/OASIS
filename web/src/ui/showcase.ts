import { recipeSchema, type Recipe } from '../core/recipe';

/**
 * The world turning slowly behind the start screen. A real world built by the engine (not a video or a picture). Its
 * downtown is towers designed in code, so it looks finished even before the AI server answers; the rest is pack
 * models (or simple shapes while the server wakes). Hand-written, modelled on a GLM-made coastal city.
 */
const SHOWCASE = {
  version: 1,
  title: 'Oasis Bay',
  seed: 846752854,
  terrain: { shape: 'plains', roughness: 0.2, height: 0.3, seaLevel: 0.3 },
  climate: { temperature: 0.6, moisture: 0.6 },
  water: { river: true, lake: false },
  atmosphere: { time: 'day', weather: 'clear', fog: 0.08, wind: 0.35 },
  places: [
    {
      id: 'downtown', kind: 'settlement', label: 'Downtown', asset: 'glass skyscraper', size: 'large', interaction: 'door', where: [{ rel: 'flat' }],
      layout: { pattern: 'grid', count: 44, height: 'tall', centre: 'fountain', variants: ['office tower', 'apartment block', 'hotel tower'] },
      props: [{ asset: 'park bench', count: 4, size: 'small' }, { asset: 'sports car', count: 4, size: 'small' }],
    },
    {
      id: 'midtown', kind: 'settlement', label: 'Midtown', asset: 'apartment block', size: 'large', interaction: 'door',
      where: [{ rel: 'near', target: 'downtown', maxDist: 110 }, { rel: 'flat' }],
      layout: { pattern: 'grid', count: 20, height: 'mixed', variants: ['office block'] },
    },
    { id: 'spire', kind: 'landmark', label: 'Oasis Spire', asset: 'glass skyscraper', size: 'large', where: [{ rel: 'near', target: 'downtown', maxDist: 60 }] },
    { id: 'harbour', kind: 'structure', label: 'Harbour', asset: 'harbour port', size: 'large', where: [{ rel: 'by_water' }, { rel: 'near', target: 'downtown', maxDist: 160 }] },
    { id: 'lighthouse', kind: 'landmark', label: 'Lighthouse', asset: 'white stone lighthouse', size: 'medium', interaction: 'light', where: [{ rel: 'by_water' }, { rel: 'far_from', target: 'downtown', minDist: 120 }] },
    {
      id: 'park', kind: 'settlement', label: 'City park', asset: 'oak tree', size: 'medium', where: [{ rel: 'near', target: 'downtown', maxDist: 120 }],
      layout: { pattern: 'scatter', count: 16, height: 'low' },
    },
  ],
  paths: [{ from: 'downtown', to: 'harbour' }],
  life: [{ kind: 'birds', count: 12 }],
};

export const showcaseRecipe = (): Recipe => recipeSchema.parse(SHOWCASE);

/**
 * The orbit: around the downtown, a little above its towers, slow (about four minutes a turn). It aims below the
 * centre so the skyline stands between the logo and the prompt panel.
 */
export const SHOWCASE_ORBIT = { radius: 140, height: 50, look: -30, speed: 0.026 };
/** The menu's light: a warm afternoon sun, held still while the menu is open. */
export const SHOWCASE_HOURS = 15.8;
