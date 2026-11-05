import { z } from 'zod';

/** A model the AI describes as simple parts, data only (mirrors backend `ProceduralModel`; shared/fixtures/assets/ is the contract). */
export const MAX_PARTS = 24;
const position = z.number().min(-30).max(30);
const length = z.number().gt(0).max(30);
const angle = z.number().min(-6.3).max(6.3);

export const PART_SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'ring'] as const;
export const partSchema = z.strictObject({
  shape: z.enum(PART_SHAPES),
  at: z.tuple([position, position, position]),
  size: z.tuple([length, length, length]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  rotate: z.tuple([angle, angle, angle]).optional(),
});
export const partsSchema = z.array(partSchema).min(1).max(MAX_PARTS);

export type Part = z.infer<typeof partSchema>;
