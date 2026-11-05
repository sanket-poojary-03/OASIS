import type { WorldField } from './field';

/** The only things that lie on a river, lake or sea bed. */
export const BED_KINDS: readonly string[] = ['rock', 'pebble', 'reed'];

/** How far below a water surface a point is; 0 above it, and anywhere that is not water. */
export function depthBelowSurface(field: WorldField, x: number, y: number, z: number): number {
  if (!field.isWater(x, z)) return 0;
  const surface = field.waterSurfaceAt(x, z);
  return surface === null ? 0 : Math.max(0, surface - y);
}
