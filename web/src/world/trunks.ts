import { isTreeKind, type ItemKind, type ScatterItem } from './scatter';

/** An upright cylinder around a tree's trunk: `y` is its middle. */
export interface Trunk { x: number; y: number; z: number; radius: number; halfHeight: number }
/** Where a model's trunk stands and how thick it is, in the model's own space at scale 1 (render measures its base). */
export interface TrunkShape { x: number; z: number; radius: number }

/** A trunk's radius as a share of its tree's height (a 6 m oak is 0.3 m), held between these at scale 1. */
const TRUNK_SHARE = 0.05, MIN_RADIUS = 0.2, MAX_RADIUS = 0.9;
/** No trunk is thinner than this, however slender its model: the player still bumps into it. */
const THINNEST = 0.15;
/** The trunk reaches this share of the tree, never lower than MIN_TRUNK: taller than the player, so nobody steps over it. */
const TRUNK_HEIGHT = 0.4, MIN_TRUNK = 2.4;
/** Sunk this far into the ground, so its foot is buried on the low side of a slope. */
const SINK = 0.4;

/** A trunk in the middle, sized by the tree's height: for a stand-in shape, which has no measured base. */
export const standInTrunk = (height: number): TrunkShape => ({ x: 0, z: 0, radius: Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, height * TRUNK_SHARE)) });

/**
 * Colliders for the trees among a chunk's scatter, preset kinds and named canopy plants alike. Only the trunk is solid:
 * you walk under the canopy and bump the trunk, as in a real wood. `heightOf` is the height a kind is drawn at (metres
 * at scale 1). `shapeOf` is the trunk of the model an item is drawn with, or null when it is not drawn at all, so no
 * invisible tree blocks the way. Models' trunks are rarely in their middle (a leaning canopy shifts it a metre or more),
 * so the offset turns and scales with each tree.
 */
export function trunkColliders(items: readonly ScatterItem[], heightOf: (kind: ItemKind) => number,
  shapeOf: (item: ScatterItem) => TrunkShape | null = (it) => standInTrunk(heightOf(it.kind))): Trunk[] {
  const out: Trunk[] = [];
  for (const it of items) {
    if (!isTreeKind(it.kind)) continue;
    const shape = shapeOf(it);
    if (!shape) continue;
    const h = heightOf(it.kind), s = it.scale, cos = Math.cos(it.rotation), sin = Math.sin(it.rotation);
    const halfHeight = (Math.max(MIN_TRUNK, h * TRUNK_HEIGHT) * s + SINK) / 2;
    out.push({
      x: it.x + (shape.x * cos + shape.z * sin) * s,
      y: it.y - SINK + halfHeight,
      z: it.z + (shape.z * cos - shape.x * sin) * s,
      radius: Math.max(THINNEST, shape.radius * s),
      halfHeight,
    });
  }
  return out;
}
