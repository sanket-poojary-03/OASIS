/**
 * The start screen's camera and clock: one unbroken take through one world. A beat says where the camera is circling
 * and what time it is at a given second; between two beats everything eases from one to the other, so the sun goes down
 * while the camera circles, and the camera flies from place to place. Pure, so the loop can be checked without a browser.
 */
export interface MenuBeat {
  /** Seconds into the loop. */
  at: number;
  /** The id of the place being circled. */
  focus: string;
  /** Hours on the clock, counting on past 24 so night runs forward into morning. */
  hours: number;
  radius: number;
  /** Metres above the place. */
  height: number;
  /** How far above the place's ground the camera aims. */
  look: number;
  /** Half the width of the area the sun's shadows cover. */
  shadow: number;
}

export interface MenuShot { x: number; y: number; z: number; hours: number; radius: number; height: number; look: number; shadow: number }

/** How much higher the camera rises in the middle of a flight, to clear what lies between two places and see the land. */
const FLIGHT_LIFT = 45;

const ease = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export const menuLength = (beats: readonly MenuBeat[]): number => beats[beats.length - 1].at;

/** The shot `seconds` after the start; the beats loop. A focus with no known place keeps the camera on the first one that has. */
export function menuShot(beats: readonly MenuBeat[], where: ReadonlyMap<string, { x: number; y: number; z: number }>, seconds: number): MenuShot {
  const t = ((seconds % menuLength(beats)) + menuLength(beats)) % menuLength(beats);
  let i = 0;
  while (i < beats.length - 2 && t >= beats[i + 1].at) i++;
  const a = beats[i], b = beats[i + 1];
  const raw = (t - a.at) / (b.at - a.at), k = ease(raw);
  const fallback = where.values().next().value ?? { x: 0, y: 0, z: 0 };
  const pa = where.get(a.focus) ?? fallback, pb = where.get(b.focus) ?? fallback;
  const flying = pa !== pb;
  return {
    x: mix(pa.x, pb.x, k), y: mix(pa.y, pb.y, k), z: mix(pa.z, pb.z, k),
    hours: mix(a.hours, b.hours, raw) % 24,
    radius: mix(a.radius, b.radius, k),
    height: mix(a.height, b.height, k) + (flying ? Math.sin(raw * Math.PI) * FLIGHT_LIFT : 0),
    look: mix(a.look, b.look, k),
    shadow: mix(a.shadow, b.shadow, k),
  };
}
