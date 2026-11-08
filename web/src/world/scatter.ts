import { FLORA_LAYERS, type Flora, type FloraLayer, type FloraSpot } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import { biomeAt, type Biome } from './biome';
import type { WorldField } from './field';

/** Ground grass is not a scatter kind: it is the wind grass in ChunkData.grass (one grass, not cones plus blades). */
export const SCATTER_KINDS = [
  'tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree', 'bush', 'rock', 'pebble', 'cactus', 'reed',
  'flowers', 'fern', 'mushroom', 'log', 'stump',
] as const;
export type ScatterKind = (typeof SCATTER_KINDS)[number];
/** A plant the AI named (recipe `flora`): its layer and asset, "canopy:twisted spooky tree". Preset kinds have no colon. */
export type FloraKey = `${FloraLayer}:${string}`;
export type ItemKind = ScatterKind | FloraKey;
/** `variant` picks one of the kind's models (0..7, modulo how many it has), so a forest is never one tree repeated. */
export interface ScatterItem { kind: ItemKind; x: number; y: number; z: number; rotation: number; scale: number; variant: number }

export const SCATTER_CELL = 4;
export const VARIANTS = 8;
const REED_DEPTH = 2.5;

type Rule = [ItemKind, number];

export const floraKey = (f: Pick<Flora, 'layer' | 'asset'>): FloraKey => `${f.layer}:${f.asset.trim().toLowerCase()}`;

export function parseFloraKey(kind: string): { layer: FloraLayer; asset: string } | null {
  const i = kind.indexOf(':');
  if (i < 0) return null;
  const layer = kind.slice(0, i) as FloraLayer;
  return FLORA_LAYERS.includes(layer) ? { layer, asset: kind.slice(i + 1) } : null;
}

/** Which layer each preset kind belongs to: a named plant of that layer takes its place. Logs and stumps go with the trees. */
const PRESET_LAYER: Record<ScatterKind, FloraLayer> = {
  tree: 'canopy', birch: 'canopy', autumn_tree: 'canopy', pine: 'canopy', snowy_pine: 'canopy', palm: 'canopy', dead_tree: 'canopy', log: 'canopy', stump: 'canopy',
  bush: 'shrub', cactus: 'shrub',
  flowers: 'ground', fern: 'ground', mushroom: 'ground', reed: 'ground',
  rock: 'rock', pebble: 'rock',
};

export const layerOf = (kind: ItemKind): FloraLayer => parseFloraKey(kind)?.layer ?? PRESET_LAYER[kind as ScatterKind];

/**
 * Which broadleaf tree a grove grows: a slow noise splits forests into oak, birch and autumn groves (hundreds of
 * metres each), so walking on the scenery changes instead of repeating.
 */
export function groveTree(grove: number): ScatterKind {
  if (grove > 0.3) return 'birch';
  if (grove < -0.35) return 'autumn_tree';
  return 'tree';
}

/** Probability per 4 m cell; first match wins. Trees and shrubs plus ground cover (flowers, ferns, mushrooms, logs). */
export function scatterRules(biome: Biome, grove: number, temperature: number): Rule[] {
  const t = groveTree(grove);
  switch (biome) {
    case 'sand': return temperature > 0.6 ? [['palm', 0.025], ['rock', 0.015], ['pebble', 0.03]] : [['rock', 0.02], ['pebble', 0.03]];
    case 'grass': return [['bush', 0.04], [t, 0.035], ['flowers', 0.07], ['rock', 0.015], ['pebble', 0.015], ['stump', 0.004]];
    case 'forest': return [[t, 0.17], ['bush', 0.06], ['fern', 0.08], ['mushroom', 0.025], ['log', 0.012], ['stump', 0.01], ['rock', 0.015], ['flowers', 0.02]];
    case 'pine': return [['pine', 0.2], ['fern', 0.04], ['rock', 0.03], ['log', 0.01], ['stump', 0.008], ['mushroom', 0.01]];
    case 'snow': return [['snowy_pine', 0.07], ['rock', 0.05]];
    case 'rock': return [['rock', 0.07], ['pebble', 0.05]];
    case 'desert': return [['cactus', 0.03], ['rock', 0.035], ['dead_tree', 0.008], ['pebble', 0.03]];
    case 'marsh': return [['reed', 0.25], ['dead_tree', 0.025], ['fern', 0.03], ['mushroom', 0.02], ['log', 0.01]];
  }
}

/** A city's open lot: shade trees and planting, whatever grows on the land outside the city. */
const parkRules = (grove: number): Rule[] => [[groveTree(grove), 0.3], ['bush', 0.12], ['flowers', 0.08]];

/** How far a wide, low thing reaches from its middle, in metres at scale 1: it sinks by the slope over that, so its low side touches. */
const GROUND_REACH: Partial<Record<ScatterKind, number>> = { rock: 1, log: 1.5, stump: 0.6, bush: 0.5, pebble: 0.3 };
/** The same for a named plant, by its layer (a named tree stands at the ground like a preset one). */
const FLORA_REACH: Partial<Record<FloraLayer, number>> = { shrub: 0.5, ground: 0.3, rock: 1 };
const MAX_SCATTER_SINK = 0.5;
const TREES: ReadonlySet<ScatterKind> = new Set(['tree', 'birch', 'autumn_tree', 'pine', 'snowy_pine', 'palm', 'dead_tree']);
/** A tree: a preset tree kind, or a plant the AI named for the canopy (not logs or stumps, which lie low). */
export const isTreeKind = (kind: ItemKind): boolean => {
  const named = parseFloraKey(kind);
  return named ? named.layer === 'canopy' : TREES.has(kind as ScatterKind);
};
/** The share of a forest's trees left standing among a settlement's houses: people clear the land they live on. */
const SETTLEMENT_TREES = 0.3;

/** Which of the recipe's `nature` amounts governs each layer. */
const NATURE: Record<FloraLayer, 'trees' | 'plants' | 'rocks'> = { canopy: 'trees', shrub: 'plants', ground: 'plants', rock: 'rocks' };

/** A named plant's chance per 4 m cell at density 1, on the land that grows most of its layer (a forest's 0.17 trees). */
const LAYER_BASE: Record<FloraLayer, number> = { canopy: 0.17, shrub: 0.06, ground: 0.09, rock: 0.03 };
/**
 * How much of each layer a kind of land grows, as a share of LAYER_BASE: the biome still shapes the world, so a named
 * tree is thick in the forest, scattered over meadows and rare in the desert. Cliffs ('rock') keep their preset rocks.
 */
const LAND_SHARE: Record<Exclude<Biome, 'rock'>, Record<FloraLayer, number>> = {
  forest: { canopy: 1, shrub: 1, ground: 1, rock: 0.5 },
  pine: { canopy: 1.1, shrub: 0.5, ground: 0.6, rock: 1 },
  grass: { canopy: 0.2, shrub: 0.7, ground: 0.9, rock: 0.5 },
  marsh: { canopy: 0.3, shrub: 0.6, ground: 1.6, rock: 0.3 },
  desert: { canopy: 0.08, shrub: 0.6, ground: 0.4, rock: 1.2 },
  sand: { canopy: 0.15, shrub: 0.3, ground: 0.3, rock: 0.8 },
  snow: { canopy: 0.4, shrub: 0.3, ground: 0.2, rock: 1.6 },
};
/** A plant with spot `wet` grows within this of water, `dry` beyond DRY, `shore` within SHORE (or just above the sea). */
const WET = 25, DRY = 40, SHORE = 12;
/** `high` and `low` as a share of the world's relief. */
const HIGH = 0.55, LOW = 0.35;

/** How thick a layer grows where none of its plants is suited (all want water, say, and this is dry land). */
const OFF_SPOT = 0.25;

/**
 * The preset rules with every layer the AI named swapped for its plants. A spot is where a plant thrives: there it wins
 * over the layer's `anywhere` plants; where no plant of a layer is suited, they all grow thinly (OFF_SPOT), so naming
 * only "willow by the water" never leaves the rest of the land treeless. Of several plants in play, a slow noise per
 * layer (`patch`, 0..1) picks one per stretch of land, so they grow in patches of their own, not mixed like salt.
 */
export function floraRules(preset: Rule[], biome: Exclude<Biome, 'rock'>, flora: readonly Flora[], fits: (spot: FloraSpot) => boolean, patch: (layer: FloraLayer) => number): Rule[] {
  const named = new Set(flora.map((f) => f.layer));
  const rules: Rule[] = preset.filter(([k]) => !named.has(layerOf(k)));
  for (const layer of FLORA_LAYERS) {
    if (!named.has(layer)) continue;
    const mine = flora.filter((f) => f.layer === layer);
    const suited = mine.filter((f) => f.spot !== 'anywhere' && fits(f.spot));
    const here = suited.length ? suited : mine.filter((f) => f.spot === 'anywhere');
    const pool = here.length ? here : mine;
    const f = pool[Math.min(pool.length - 1, Math.floor(patch(layer) * pool.length))];
    rules.push([floraKey(f), LAYER_BASE[layer] * LAND_SHARE[biome][layer] * f.density * (here.length ? 1 : OFF_SPOT)]);
  }
  return rules;
}

/** What lies on a bed: stones anywhere, reeds only where they can reach the surface. */
export function bedRules(depth: number): Rule[] {
  return depth < REED_DEPTH ? [['reed', 0.14], ['rock', 0.025], ['pebble', 0.05]] : [['rock', 0.025], ['pebble', 0.05]];
}

export function scatterChunk(field: WorldField, cx: number, cz: number, size = 64): ScatterItem[] {
  const out: ScatterItem[] = [];
  const n = size / SCATTER_CELL;
  const nature = field.recipe.nature;
  const flora = field.recipe.flora?.length ? field.recipe.flora : null;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const rng = mulberry32(hashString(`${field.recipe.seed}:${gx}:${gz}`));
    const x = gx * SCATTER_CELL + rng() * SCATTER_CELL;
    const z = gz * SCATTER_CELL + rng() * SCATTER_CELL;
    const roll = rng();
    let acc = 0, kind: ItemKind | null = null;
    const surface = field.isWater(x, z) ? field.waterSurfaceAt(x, z) : null;
    const grove = field.detailNoise(x * 0.004 + 31.7, z * 0.004 - 12.3);
    const park = field.inPark(x, z);
    const rules = surface !== null ? bedRules(surface - field.heightAt(x, z)) : park ? parkRules(grove) : landRules(field, x, z, grove, flora);
    for (const [k, p] of rules) {
      acc += p * (nature?.[NATURE[layerOf(k)]] ?? 1);
      if (roll < acc) { kind = k; break; }
    }
    if (!kind) continue;
    const named = parseFloraKey(kind);
    if (layerOf(kind) !== 'rock' && field.slopeAt(x, z) > 0.6) continue;
    if (field.isReserved(x, z, 2) || field.pavedAt(x, z) > 0 || field.cropAt(x, z)) continue;
    if (isTreeKind(kind) &&!park && field.inSettlement(x, z) && rng() > SETTLEMENT_TREES) continue;
    const rotation = rng() * Math.PI * 2, scale = 0.75 + rng() * 0.6, variant = Math.floor(rng() * VARIANTS);
    const reach = named ? FLORA_REACH[named.layer] : GROUND_REACH[kind as ScatterKind];
    const sink = reach === undefined ? 0 : Math.min(MAX_SCATTER_SINK, field.slopeAt(x, z) * reach * scale);
    out.push({ kind, x, y: field.heightAt(x, z) - sink, z, rotation, scale, variant });
  }
  return out;
}

/** What grows on open land: the biome's preset rules, with the AI's named plants in place of the layers it named. */
function landRules(field: WorldField, x: number, z: number, grove: number, flora: readonly Flora[] | null): Rule[] {
  const biome = biomeAt(field, x, z);
  const preset = scatterRules(biome, grove, field.recipe.climate.temperature);
  if (!flora || biome === 'rock') return preset;
  const h = field.heightAt(x, z), relief = h / field.amplitude;
  const fits = (spot: FloraSpot): boolean => {
    switch (spot) {
      case 'anywhere': return true;
      case 'wet': return field.waterDistance(x, z) < WET;
      case 'dry': return field.waterDistance(x, z) > DRY;
      case 'shore': return field.waterDistance(x, z) < SHORE || (field.hasSea && h < field.seaLevelY + 3);
      case 'high': return relief > HIGH;
      case 'low': return relief < LOW;
    }
  };
  const patch = (layer: FloraLayer): number => {
    const i = FLORA_LAYERS.indexOf(layer) + 1;
    return Math.min(0.999, Math.max(0, (field.detailNoise(x * 0.006 + 17.3 * i, z * 0.006 - 9.1 * i) * 1.6 + 1) / 2));
  };
  return floraRules(preset, biome, flora, fits, patch);
}
