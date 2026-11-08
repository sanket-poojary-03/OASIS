import { recipeSchema, type Recipe } from '../core/recipe';
import type { MenuBeat } from './menuFlight';

/**
 * The world behind the start screen: a real world built by the engine (not a video or a picture), with a village at one
 * end and a city at the other, on land chosen so that the river passes the village and never reaches the city. Every
 * model it uses ships with the site (api/bundledModels), so it looks finished whether or not the AI server is awake.
 */
const SHOWCASE = {
  version: 1,
  title: 'Oasis Valley',
  seed: 1086,
  terrain: { shape: 'hills', roughness: 0.25, height: 0.2, seaLevel: 0 },
  climate: { temperature: 0.62, moisture: 0.44 },
  water: { river: true, lake: true },
  atmosphere: { time: 'day', weather: 'clear', fog: 0.05, wind: 0.35 },
  nature: { trees: 1.1, plants: 1.3, rocks: 0.7 },
  places: [
    {
      id: 'village', kind: 'settlement', label: 'The village', asset: 'medieval cottage', size: 'medium', interaction: 'door', where: [{ rel: 'at', x: -262, z: 24 }],
      layout: { pattern: 'village', count: 16, height: 'low', variants: ['medieval house', 'tavern inn', 'stable'] },
      props: [{ asset: 'wooden barrel', count: 6, size: 'small' }, { asset: 'hay bale', count: 6, size: 'small' }, { asset: 'wooden cart', count: 3, size: 'medium' }, { asset: 'torch lantern', count: 5, size: 'large' }],
    },
    { id: 'windmill', kind: 'landmark', label: 'The windmill', asset: 'farm windmill', size: 'medium', where: [{ rel: 'highest' }, { rel: 'near', target: 'village', maxDist: 45 }] },
    { id: 'chapel', kind: 'landmark', label: 'The bell tower', asset: 'medieval bell tower', size: 'small', where: [{ rel: 'flat' }, { rel: 'near', target: 'village', maxDist: 14 }, { rel: 'far_from', target: 'windmill', minDist: 110 }] },
    { id: 'barn', kind: 'structure', label: 'The barn', asset: 'farm barn', size: 'large', where: [{ rel: 'flat' }, { rel: 'near', target: 'village', maxDist: 22 }, { rel: 'far_from', target: 'chapel', minDist: 120 }] },
    { id: 'silo', kind: 'landmark', label: 'The silo', asset: 'grain silo', size: 'small', where: [{ rel: 'near', target: 'barn', maxDist: 14 }, { rel: 'flat' }] },
    { id: 'watermill', kind: 'structure', label: 'The watermill', asset: 'medieval watermill', size: 'large', where: [{ rel: 'by_water' }, { rel: 'flat' }, { rel: 'near', target: 'village', maxDist: 40 }] },
    {
      id: 'city', kind: 'settlement', label: 'The city', asset: 'glass skyscraper', size: 'large', interaction: 'door', where: [{ rel: 'at', x: 208, z: -208 }],
      layout: { pattern: 'grid', count: 40, height: 'tall', centre: 'fountain', variants: ['office tower', 'apartment block', 'hotel tower'] },
      props: [{ asset: 'oak tree', count: 6, size: 'large' }, { asset: 'park bench', count: 4, size: 'small' }, { asset: 'sports car', count: 6, size: 'small' }],
    },
  ],
  scenery: [{ asset: 'fallen log', kind: 'prop', size: 'medium' }, { asset: 'tree stump', kind: 'prop', size: 'small' }],
  life: [
    { kind: 'deer', count: 5, at: { x: -356, z: 72 } },
    { kind: 'animal', asset: 'sheep', count: 7, height: 1.1, at: { x: -232, z: 64 } },
    { kind: 'animal', asset: 'cow', count: 4, height: 1.5, at: { x: -312, z: -30 } },
    { kind: 'birds', count: 12 },
  ],
};

export const showcaseRecipe = (): Recipe => recipeSchema.parse(SHOWCASE);

/** A slow turn: about two minutes around a place. */
export const MENU_ORBIT_SPEED = 0.052;
export const MENU_FOV = 50;

const VILLAGE = { focus: 'village', radius: 66, height: 22, look: 3, shadow: 95 };
const CITY = { focus: 'city', radius: 170, height: 62, look: 14, shadow: 170 };

/**
 * One day, without a cut: the village in the afternoon, the sun going down over it and its windows coming on, the flight
 * to the city through the night, the city's lights, morning there, and the flight home.
 */
export const MENU_BEATS: MenuBeat[] = [
  { at: 0, hours: 15.6, ...VILLAGE },
  { at: 40, hours: 16.6, ...VILLAGE },
  { at: 80, hours: 17.9, ...VILLAGE }, // a long golden hour: the light is the best part of the loop, and the sun is gone by 18.2
  { at: 96, hours: 18.6, ...VILLAGE },
  { at: 112, hours: 20.2, ...VILLAGE }, // the lamps come on at 19.5
  { at: 140, hours: 22, ...VILLAGE },
  { at: 170, hours: 23, ...CITY },
  { at: 220, hours: 24 + 3, ...CITY },
  { at: 247, hours: 24 + 8, ...CITY },
  { at: 280, hours: 24 + 13, ...CITY },
  { at: 310, hours: 24 + 15.6, ...VILLAGE },
];
