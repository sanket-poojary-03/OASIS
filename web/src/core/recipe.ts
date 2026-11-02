import { z } from 'zod';

export const CORE_HALF = 512;

/** Clamp to the core map and round to 0.1 m (mirrors backend mock `_clamp`). */
export const clampCore = (v: number): number => Math.max(-CORE_HALF, Math.min(CORE_HALF, Math.round(v * 10) / 10));

export const idSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, 'id must be 2-32 chars [a-z0-9_-], starting with a letter');
const unit = z.number().min(0).max(1);
const coord = z.number().min(-CORE_HALF).max(CORE_HALF);

export const SHAPES = ['plains', 'hills', 'valley', 'mountains', 'island', 'canyon'] as const;
export const PLACE_KINDS = ['settlement', 'landmark', 'structure', 'prop'] as const;
export const PLACE_SIZES = ['small', 'medium', 'large'] as const;
export const INTERACTIONS = ['none', 'door', 'light', 'fire', 'sound', 'sit', 'push'] as const;
export const TIMES = ['dawn', 'day', 'dusk', 'night'] as const;
export const WEATHERS = ['clear', 'rain', 'snow', 'mist', 'storm'] as const;
export const LIFE_KINDS = ['deer', 'birds', 'rabbits'] as const;
export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;

export const relationSchema = z.discriminatedUnion('rel', [
  z.strictObject({ rel: z.literal('highest') }),
  z.strictObject({ rel: z.literal('lowest') }),
  z.strictObject({ rel: z.literal('flat') }),
  z.strictObject({ rel: z.literal('by_water') }),
  z.strictObject({ rel: z.literal('near'), target: idSchema, maxDist: z.number().min(5).max(600).default(80) }),
  z.strictObject({ rel: z.literal('far_from'), target: idSchema, minDist: z.number().min(20).max(800).default(200) }),
  z.strictObject({ rel: z.literal('direction'), dir: z.enum(DIRECTIONS), of: idSchema.optional() }),
  z.strictObject({ rel: z.literal('visible_from'), target: idSchema }),
  z.strictObject({ rel: z.literal('at'), x: coord, z: coord, y: z.number().min(-200).max(1000).optional() }),
]);

export const placeSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(PLACE_KINDS),
  label: z.string().min(1).max(60),
  asset: z.string().min(2).max(120),
  style: z.string().max(40).optional(),
  size: z.enum(PLACE_SIZES).default('medium'),
  interaction: z.enum(INTERACTIONS).default('none'),
  description: z.string().max(280).optional(),
  where: z.array(relationSchema).max(4).default([]),
});

export const atmosphereSchema = z.strictObject({
  time: z.enum(TIMES),
  weather: z.enum(WEATHERS),
  fog: unit,
  wind: unit,
});

export const recipeSchema = z
  .strictObject({
    version: z.literal(1),
    title: z.string().min(1).max(80),
    seed: z.number().int().min(0).max(2147483647),
    terrain: z.strictObject({ shape: z.enum(SHAPES), roughness: unit, height: unit, seaLevel: unit }),
    climate: z.strictObject({ temperature: unit, moisture: unit }),
    water: z.strictObject({ river: z.boolean(), lake: z.boolean() }),
    atmosphere: atmosphereSchema,
    places: z.array(placeSchema).max(12),
    paths: z.array(z.strictObject({ from: idSchema, to: idSchema })).max(12).default([]),
    life: z.array(z.strictObject({ kind: z.enum(LIFE_KINDS), count: z.number().int().min(1).max(20) })).max(4).default([]),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    for (const p of r.places) {
      if (ids.has(p.id)) ctx.addIssue({ code: 'custom', message: `duplicate place id "${p.id}"` });
      ids.add(p.id);
    }
    for (const p of r.places) {
      for (const rel of p.where) {
        const target = 'target' in rel ? rel.target : rel.rel === 'direction' ? rel.of : undefined;
        if (target !== undefined && !ids.has(target)) ctx.addIssue({ code: 'custom', message: `place "${p.id}" refers to unknown place "${target}"` });
      }
    }
    for (const path of r.paths) {
      if (!ids.has(path.from) || !ids.has(path.to)) ctx.addIssue({ code: 'custom', message: `path ${path.from}→${path.to} refers to an unknown place` });
    }
  });

export type Recipe = z.infer<typeof recipeSchema>;
export type Place = z.infer<typeof placeSchema>;
export type Relation = z.infer<typeof relationSchema>;
export type Atmosphere = z.infer<typeof atmosphereSchema>;
export type Interaction = (typeof INTERACTIONS)[number];
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type PlaceSize = (typeof PLACE_SIZES)[number];
export type LifeKind = (typeof LIFE_KINDS)[number];

export function parseRecipe(data: unknown): { ok: true; recipe: Recipe } | { ok: false; error: string } {
  const res = recipeSchema.safeParse(data);
  if (res.success) return { ok: true, recipe: res.data };
  return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.') || 'recipe'}: ${i.message}`).join('; ') };
}
