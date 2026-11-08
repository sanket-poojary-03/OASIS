import type { Op } from '../core/ops';
import type { Recipe } from '../core/recipe';
import type { Placement } from '../world/placement';

type Spot = { x: number; z: number };

export interface EditReportInput {
  ops: Op[];
  before: Recipe;
  after: Recipe;
  /** The placements of the rebuilt world. */
  placements: Placement[];
  /** Where the animals of `after.life[index]` were put (empty when none found room). */
  lifeSpots: (index: number) => Spot[];
  /** yaw: the camera's, so 0 faces north (-z). */
  player: { x: number; z: number; yaw: number };
}

/** Closer than this, a thing is "right here". */
const HERE = 6;

/** "37 m ahead", "120 m to your left": which way to turn to see it, from where the player looks. */
function whereFrom(p: EditReportInput['player'], s: Spot): string {
  const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
  if (d < HERE) return 'right here';
  const ahead = -dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw), right = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
  const angle = Math.abs(Math.atan2(right, ahead));
  const way = angle < Math.PI / 4 ? 'ahead' : angle > (3 * Math.PI) / 4 ? 'behind you' : right > 0 ? 'to your right' : 'to your left';
  return `${Math.round(d)} m ${way}`;
}

const centre = (spots: Spot[]): Spot => ({ x: spots.reduce((s, p) => s + p.x, 0) / spots.length, z: spots.reduce((s, p) => s + p.z, 0) / spots.length });

/**
 * What an edit put in the world, for the toast after it is built: every place added, moved or changed and every animal
 * added, each with how far and which way to look ("Added dragon, 37 m ahead"). Null when the edit placed nothing.
 */
export function reportEdit({ ops, before, after, placements, lifeSpots, player }: EditReportInput): string | null {
  const lines: string[] = [];
  const label = (r: Recipe, id: string) => r.places.find((p) => p.id === id)?.label ?? id;
  const placed = (verb: string, id: string) => {
    const pl = placements.find((p) => p.id === id);
    if (!pl) return `${verb} ${label(after, id)}`;
    const why = pl.reasons.filter((r) => r !== 'placed where you asked');
    return `${verb} ${label(after, id)}, ${whereFrom(player, pl)}${why.length ? ` (${why.join(', ')})` : ''}`;
  };
  let life = before.life.length; // applyOps appends each addLife in order
  for (const op of ops) {
    if (op.op === 'addPlace') lines.push(placed('Added', op.place.id));
    else if (op.op === 'movePlace') lines.push(placed('Moved', op.id));
    else if (op.op === 'updatePlace') lines.push(placed('Changed', op.id));
    else if (op.op === 'removePlace') lines.push(`Removed ${label(before, op.id)}`);
    else if (op.op === 'addLife') {
      const name = op.asset ?? op.kind, spots = lifeSpots(life++);
      lines.push(spots.length ? `Added ${spots.length > 1 ? `${spots.length} ` : ''}${name}, ${whereFrom(player, centre(spots))}` : `No room for ${name} anywhere near`);
    }
  }
  return lines.length ? lines.join(' · ') : null;
}
