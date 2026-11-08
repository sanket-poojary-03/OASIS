/** The part of a model that meets the ground, around its own origin (metres, before it is turned). */
export interface ModelBase { minX: number; maxX: number; minZ: number; maxZ: number }

export interface GroundPose { y: number; tiltX: number; tiltZ: number }

/** Steepest a model leans to lie on a slope (about 27°). */
const MAX_LEAN = 0.5;
/** The ground is sampled at least this far out, so a slope is still read under a narrow base. */
const MIN_REACH = 0.5;
/** The most of its height a model sinks to keep its low side on the ground, and at most this many metres. */
const SINK_SHARE = 0.2;
const MAX_SINK = 1.5;
/** A little deeper than the low side, because the drawn terrain is straight between grid points. */
const SINK_EXTRA = 0.03;

/**
 * How a model of this base and height rests on uneven ground at (x, z), turned by `rotation`. Objects used to stand at
 * the height under their middle, so on a slope the low side hung in the air. `lean`: it also tips to the slope (a cart,
 * a log). Otherwise it stays upright (a lamp, a house). Either way it sinks until its low side touches.
 */
export function groundPose(heightAt: (x: number, z: number) => number, x: number, z: number, rotation: number, base: ModelBase, height: number, lean: boolean): GroundPose {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const midX = (base.minX + base.maxX) / 2, midZ = (base.minZ + base.maxZ) / 2;
  const reachX = Math.max(MIN_REACH, (base.maxX - base.minX) / 2), reachZ = Math.max(MIN_REACH, (base.maxZ - base.minZ) / 2);
  const samples: Array<{ u: number; v: number; h: number }> = [];
  for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
    const lx = midX + u * reachX, lz = midZ + v * reachZ;
    samples.push({ u, v, h: heightAt(x + lx * c + lz * s, z - lx * s + lz * c) });
  }
  const centre = heightAt(x, z);
  let slopeX = 0, slopeZ = 0, mean = 0;
  if (lean) {
    // A least-squares plane through the samples: with this symmetric grid each slope is a simple weighted sum.
    for (const p of samples) { slopeX += p.u * p.h; slopeZ += p.v * p.h; mean += p.h; }
    slopeX = clampLean(slopeX / (6 * reachX));
    slopeZ = clampLean(slopeZ / (6 * reachZ));
    mean /= samples.length;
  }
  const rest = lean ? mean - slopeX * midX - slopeZ * midZ : centre;
  let gap = 0;
  for (const p of samples) {
    const lx = midX + p.u * reachX, lz = midZ + p.v * reachZ;
    gap = Math.max(gap, rest + slopeX * lx + slopeZ * lz - p.h);
  }
  const sink = gap > 1e-3 ? Math.min(gap + SINK_EXTRA, Math.min(MAX_SINK, height * SINK_SHARE)) : 0;
  return { y: rest - sink, tiltX: -Math.atan(slopeZ), tiltZ: Math.atan(slopeX) };
}

const clampLean = (slope: number): number => Math.max(-Math.tan(MAX_LEAN), Math.min(Math.tan(MAX_LEAN), slope));
