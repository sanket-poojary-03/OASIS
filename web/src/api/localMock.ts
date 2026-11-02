import type { Op } from '../core/ops';
import { clampCore, recipeSchema, type Interaction, type Place, type Recipe } from '../core/recipe';
import { hashString } from '../core/rng';
import type { EditContext, EditResult, WorldResult } from './types';

const fixtures = import.meta.glob('../../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** Keep identical to backend/app/mock.py KEYWORDS (same words, same order). */
export const KEYWORDS: Record<string, string[]> = {
  'fishing-valley': ['valley', 'river', 'village', 'fishing', 'pine', 'forest', 'mist', 'misty', 'stream', 'meadow', 'green', 'tower'],
  'desert-canyon': ['desert', 'canyon', 'sand', 'sandy', 'oasis', 'dune', 'dunes', 'arch', 'mesa', 'dry', 'hot', 'cactus', 'obelisk'],
  'snowy-mountains': ['snow', 'snowy', 'mountain', 'mountains', 'castle', 'winter', 'ice', 'icy', 'frozen', 'alpine', 'lake', 'peak', 'peaks'],
  'tropical-island': ['island', 'beach', 'tropical', 'lighthouse', 'sea', 'ocean', 'palm', 'coast', 'bay', 'harbor', 'harbour'],
};

export function pickFixture(prompt: string): string {
  const words = new Set(prompt.toLowerCase().match(/[a-z]+/g) ?? []);
  let best = 'fishing-valley', bestScore = 0;
  for (const [name, keys] of Object.entries(KEYWORDS)) {
    const score = new Set(keys.filter((k) => words.has(k))).size;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return best;
}

export function fixtureRecipe(name: string): Recipe {
  return recipeSchema.parse(fixtures[`../../../shared/fixtures/recipes/${name}.json`]);
}

export function localWorld(prompt: string): WorldResult {
  const r = fixtureRecipe(pickFixture(prompt));
  return { type: 'recipe', recipe: { ...r, seed: hashString(prompt.trim().toLowerCase()) & 0x7fffffff }, notes: ['Offline mode: used the preset world closest to your description.'], source: 'offline' };
}

// ---- edit parser: constants copied exactly from backend/app/mock.py ----
const TIME: Array<[RegExp, 'night' | 'dawn' | 'dusk' | 'day']> = [[/\b(night|midnight)\b/, 'night'], [/\b(dawn|sunrise|morning)\b/, 'dawn'], [/\b(dusk|sunset|evening)\b/, 'dusk'], [/\b(noon|midday|daytime|day)\b/, 'day']];
const WEATHER: Array<[RegExp, 'storm' | 'rain' | 'snow' | 'mist' | 'clear']> = [[/\b(storm|stormy|thunder\w*)\b/, 'storm'], [/\b(rain|rainy|raining)\b/, 'rain'], [/\b(snow|snowy|snowing)\b/, 'snow'], [/\b(mist|misty|fog|foggy)\b/, 'mist'], [/\b(clear|sunny)\b/, 'clear']];
const ATMOS = new Set(['rain', 'snow', 'fog', 'mist', 'storm', 'night', 'day', 'sunset', 'sunrise', 'dawn', 'dusk']);
const NEAR_THIS = /\s+(?:near|next to|beside|by)\s+(?:this|that|it)\b/g;
const ON_THIS = /\s+on\s+(?:(?:this|that|it)(?:\s+[a-z]+)?|top of\s+(?:this|that|it|the)(?:\s+[a-z]+)?)(?=\s*[.!]?$)/g;
const ADD = /\b(?:add|put|place|build|spawn|create|bring)\s+(?:(?:an|a|the|some)\s+)?(?<noun>[a-z][a-z \-]{1,60}?)(?:\s+(?:here|there|in front of me|where i'?m looking|where i am looking|over there))?\s*[.!]?$/;
const REMOVE = /\b(?:remove|delete|destroy)\b|\bget rid of\b/;
const LANDMARK = /tower|castle|lighthouse|statue|temple|obelisk|windmill|arch|monument/;
const STRUCTURE = /house|cabin|hut|shrine|tent|lodge|well|dock|cottage|barn|inn|stall/;
const INTERACT: Array<[RegExp, Interaction]> = [[/lamp|lantern|light|torch|candle/, 'light'], [/campfire|bonfire|fire/, 'fire'], [/bell|gong/, 'sound'], [/bench|chair|seat|stool/, 'sit'], [/barrel|crate|box/, 'push'], [/house|cabin|hut|cottage|lodge|barn|inn/, 'door']];

const ok = (ops: Op[]): EditResult => ({ type: 'ops', ops, notes: [], source: 'offline' });
const no = (reason: string): EditResult => ({ type: 'unsupported', reason, source: 'offline' });

function slug(noun: string, existing: Set<string>): string {
  let base = noun.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'thing';
  if (!/^[a-z]/.test(base)) base = `p-${base}`;
  if (base.length < 2) base = `${base}x`;
  let out = base;
  for (let i = 2; existing.has(out); i++) out = `${base}-${i}`;
  return out;
}

const titleCase = (s: string): string => s.replace(/[a-z]+/g, (w) => w[0].toUpperCase() + w.slice(1));

export function localEdit(recipe: Recipe, prompt: string, ctx: EditContext): EditResult {
  const text = prompt.toLowerCase().trim();
  const existing = new Set(recipe.places.map((p) => p.id));
  if (REMOVE.test(text)) {
    const target = ctx.lookingAt ?? recipe.places.find((p) => text.includes(p.label.toLowerCase()) || text.includes(p.id))?.id;
    return target ? ok([{ op: 'removePlace', id: target }]) : no('Look at the thing you want to remove, then try again.');
  }
  const nearThis = new RegExp(NEAR_THIS.source).test(text);
  const onThis = new RegExp(ON_THIS.source).test(text);
  const noun = ADD.exec(text.replace(NEAR_THIS, '').replace(ON_THIS, '').trim())?.groups?.noun?.trim();
  if (noun && !ATMOS.has(noun)) {
    const kind: Place['kind'] = LANDMARK.test(noun) ? 'landmark' : STRUCTURE.test(noun) ? 'structure' : 'prop';
    const interaction = INTERACT.find(([re]) => re.test(noun))?.[1] ?? 'none';
    const nearTarget = (): Place['where'] => [{ rel: 'near', target: ctx.lookingAt as string, maxDist: 30 }, { rel: 'flat' }];
    let where: Place['where'];
    if (nearThis && ctx.lookingAt) where = nearTarget();
    else if (ctx.lookAt) {
      const at: { rel: 'at'; x: number; z: number; y?: number } = { rel: 'at', x: clampCore(ctx.lookAt.x), z: clampCore(ctx.lookAt.z) };
      if (onThis && kind === 'prop' && ctx.lookAt.y !== undefined) at.y = Math.round(ctx.lookAt.y * 100) / 100;
      where = [at];
    } else if (ctx.lookingAt) where = nearTarget();
    else where = [{ rel: 'flat' }];
    return ok([{ op: 'addPlace', place: { id: slug(noun, existing), kind, label: titleCase(noun).slice(0, 60), asset: noun.slice(0, 120), size: kind === 'prop' ? 'small' : 'medium', interaction, where } }]);
  }
  const ops: Op[] = [];
  if (/\bwinter\b/.test(text)) ops.push({ op: 'setClimate', temperature: 0.1 }, { op: 'setAtmosphere', weather: 'snow' });
  else if (/\bsummer\b/.test(text)) ops.push({ op: 'setClimate', temperature: 0.7 }, { op: 'setAtmosphere', weather: 'clear' });
  const time = TIME.find(([re]) => re.test(text));
  if (time) ops.push({ op: 'setAtmosphere', time: time[1] });
  if (!ops.some((o) => o.op === 'setAtmosphere' && o.weather)) {
    const w = WEATHER.find(([re]) => re.test(text));
    if (w) ops.push({ op: 'setAtmosphere', weather: w[1] });
  }
  return ops.length ? ok(ops) : no("Offline mode understands time, weather, seasons, 'add X here' and 'remove that'.");
}
