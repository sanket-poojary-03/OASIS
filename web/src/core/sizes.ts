import type { Place, PlaceKind, PlaceSize } from './recipe';

/** How tall a place's model is drawn when the AI gave no height: by its kind and size word. */
export const DEFAULT_HEIGHT: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 5, medium: 6, large: 7 },
  landmark: { small: 10, medium: 16, large: 24 },
  structure: { small: 4, medium: 6, large: 9 },
  prop: { small: 1, medium: 1.6, large: 2.4 },
};

/**
 * The heights (metres) the code allows a place the AI gave a real height: it proposes "a plane, 3 m", the code keeps it
 * between these. A settlement has none: its buildings' heights come from its layout. The height never changes the
 * ground a place takes (the layout stays as its size word makes it); the model is kept within that ground instead.
 */
export const HEIGHT_RANGE: Partial<Record<PlaceKind, { min: number; max: number }>> = {
  prop: { min: 0.2, max: 6 },
  structure: { min: 2, max: 25 },
  landmark: { min: 5, max: 80 },
};

type Sized = Pick<Place, 'kind' | 'size'> & { height?: number };

/** The height a place is drawn at, and a note for its card when the one asked for was out of range. */
export function placeHeight(place: Sized): { height: number; note?: string } {
  const range = HEIGHT_RANGE[place.kind];
  if (place.height === undefined || !range) return { height: DEFAULT_HEIGHT[place.kind][place.size] };
  if (place.height > range.max) return { height: range.max, note: `made ${range.max} m tall: a ${place.kind} is at most ${range.max} m` };
  if (place.height < range.min) return { height: range.min, note: `made ${range.min} m tall: a ${place.kind} is at least ${range.min} m` };
  return { height: place.height };
}
