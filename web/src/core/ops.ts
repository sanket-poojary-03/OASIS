import { z } from 'zod';
import {
  DIRECTIONS, hexSchema, idSchema, INTERACTIONS, lifeFields, MAX_PLACES, placeSchema, recipeSchema, relationSchema, SHAPES, TIMES, WEATHERS,
  type Recipe,
} from './recipe';

const unit = z.number().min(0).max(1);
const amount = z.number().min(0).max(2);

export const opSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('addPlace'), place: placeSchema }),
  z.strictObject({ op: z.literal('removePlace'), id: idSchema }),
  z.strictObject({ op: z.literal('movePlace'), id: idSchema, where: z.array(relationSchema).min(1).max(4) }),
  z.strictObject({
    op: z.literal('updatePlace'), id: idSchema,
    label: z.string().min(1).max(60).optional(), asset: z.string().min(2).max(120).optional(),
    interaction: z.enum(INTERACTIONS).optional(), description: z.string().max(280).optional(),
  }),
  z.strictObject({ op: z.literal('setAtmosphere'), time: z.enum(TIMES).optional(), weather: z.enum(WEATHERS).optional(), fog: unit.optional(), wind: unit.optional() }),
  z.strictObject({ op: z.literal('setClimate'), temperature: unit.optional(), moisture: unit.optional() }),
  z.strictObject({ op: z.literal('setTerrain'), shape: z.enum(SHAPES).optional(), roughness: unit.optional(), height: unit.optional(), seaLevel: unit.optional() }),
  z.strictObject({ op: z.literal('setWater'), river: z.boolean().optional(), lake: z.boolean().optional() }),
  z.strictObject({ op: z.literal('setPalette'), ground: hexSchema.optional(), water: hexSchema.optional(), sky: hexSchema.optional() }),
  z.strictObject({ op: z.literal('addPath'), from: idSchema, to: idSchema }),
  z.strictObject({ op: z.literal('setNature'), trees: amount.optional(), plants: amount.optional(), rocks: amount.optional() }),
  z.strictObject({ op: z.literal('addLife'), ...lifeFields }),
]);
export const opsSchema = z.array(opSchema).min(1).max(20);
export type Op = z.infer<typeof opSchema>;

export class OpError extends Error {}

export interface ApplyResult {
  recipe: Recipe;
  changedPlaces: Set<string>;
  removedPlaces: Set<string>;
  terrainChanged: boolean;
  atmosphereChanged: boolean;
  lifeChanged: boolean;
}

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function applyOps(recipe: Recipe, ops: Op[]): ApplyResult {
  const next: Recipe = structuredClone(recipe);
  const res = { changedPlaces: new Set<string>(), removedPlaces: new Set<string>(), terrainChanged: false, atmosphereChanged: false, lifeChanged: false };
  const find = (id: string) => {
    const p = next.places.find((q) => q.id === id);
    if (!p) throw new OpError(`There is no place called "${id}".`);
    return p;
  };
  for (const op of ops) {
    switch (op.op) {
      case 'addPlace':
        if (next.places.some((p) => p.id === op.place.id)) throw new OpError(`"${op.place.id}" already exists.`);
        next.places.push(structuredClone(op.place));
        res.changedPlaces.add(op.place.id);
        break;
      case 'removePlace':
        find(op.id);
        next.places = next.places.filter((p) => p.id !== op.id);
        next.paths = next.paths.filter((p) => p.from !== op.id && p.to !== op.id);
        for (const p of next.places) {
          p.where = p.where.filter((r) => !('target' in r && r.target === op.id) && !(r.rel === 'direction' && r.of === op.id));
        }
        res.removedPlaces.add(op.id);
        break;
      case 'movePlace':
        find(op.id).where = structuredClone(op.where);
        res.changedPlaces.add(op.id);
        break;
      case 'updatePlace': {
        const { op: _op, id, ...rest } = op;
        Object.assign(find(id), defined(rest));
        res.changedPlaces.add(id);
        break;
      }
      case 'setAtmosphere': {
        const { op: _op, ...rest } = op;
        Object.assign(next.atmosphere, defined(rest));
        res.atmosphereChanged = true;
        break;
      }
      case 'setClimate': {
        const { op: _op, ...rest } = op;
        Object.assign(next.climate, defined(rest));
        res.terrainChanged = true;
        break;
      }
      case 'setTerrain': {
        const { op: _op, ...rest } = op;
        Object.assign(next.terrain, defined(rest));
        res.terrainChanged = true;
        break;
      }
      case 'setWater': {
        const { op: _op, ...rest } = op;
        Object.assign(next.water, defined(rest));
        res.terrainChanged = true;
        break;
      }
      case 'setPalette': {
        const { op: _op, ...rest } = op;
        next.palette = { ...next.palette, ...defined(rest) };
        break;
      }
      case 'addPath':
        find(op.from);
        find(op.to);
        next.paths.push({ from: op.from, to: op.to });
        break;
      case 'setNature': {
        // Which things grow changes, and nothing moves: the placements are kept and the chunks rebuilt.
        const { op: _op, ...rest } = op;
        next.nature = { trees: 1, plants: 1, rocks: 1, ...next.nature, ...defined(rest) };
        break;
      }
      case 'addLife': {
        const { op: _op, ...life } = op;
        next.life.push(structuredClone(life));
        res.lifeChanged = true;
        break;
      }
    }
  }
  if (next.places.length > MAX_PLACES) throw new OpError(`This world already has ${MAX_PLACES} places — remove one first.`);
  const parsed = recipeSchema.safeParse(next);
  if (!parsed.success) throw new OpError(parsed.error.issues.map((i) => i.message).join('; '));
  return { recipe: parsed.data, ...res };
}

function whereText(rels: z.infer<typeof relationSchema>[]): string {
  return rels.map((r) => {
    switch (r.rel) {
      case 'at': return 'where you pointed';
      case 'near': return `near ${r.target}`;
      case 'far_from': return `far from ${r.target}`;
      case 'direction': return `${r.dir} of ${r.of ?? 'the centre'}`;
      case 'visible_from': return `visible from ${r.target}`;
      case 'by_water': return 'by the water';
      default: return `on the ${r.rel} ground`;
    }
  }).join(', ');
}

export function describeOps(ops: Op[]): string[] {
  return ops.map((op) => {
    switch (op.op) {
      case 'addPlace': return `Add ${op.place.kind} “${op.place.label}” (${op.place.asset}) ${whereText(op.place.where)}`.trim();
      case 'removePlace': return `Remove ${op.id}`;
      case 'movePlace': return `Move ${op.id} ${whereText(op.where)}`;
      case 'updatePlace': return `Change ${op.id}`;
      case 'setAtmosphere': return `Set ${Object.entries(defined({ time: op.time, weather: op.weather, fog: op.fog, wind: op.wind })).map(([k, v]) => `${k} to ${v}`).join(', ')}`;
      case 'setClimate': return `Change climate (${Object.entries(defined({ temperature: op.temperature, moisture: op.moisture })).map(([k, v]) => `${k} ${v}`).join(', ')}) — rebuilds terrain`;
      case 'setTerrain': return `Reshape terrain — rebuilds the world`;
      case 'setWater': return `Change water (${op.river === undefined ? '' : `river ${op.river ? 'on' : 'off'}`}${op.lake === undefined ? '' : ` lake ${op.lake ? 'on' : 'off'}`}) — rebuilds terrain`;
      case 'setPalette': return `Recolour ${Object.entries(defined({ ground: op.ground, water: op.water, sky: op.sky })).map(([k, v]) => `${k} ${v}`).join(', ')}`;
      case 'addPath': return `Build a road from ${op.from} to ${op.to}`;
      case 'setNature': return `Change what grows (${Object.entries(defined({ trees: op.trees, plants: op.plants, rocks: op.rocks })).map(([k, v]) => `${k} ${v}`).join(', ')})`;
      case 'addLife': return `Add ${op.count} ${op.asset ?? op.kind}${op.at ? ' where you pointed' : ''}`;
    }
  });
}

export { DIRECTIONS };
