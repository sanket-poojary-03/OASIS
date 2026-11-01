import type { Interaction, Place } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Road, WorldField } from './field';
import type { Placement } from './placement';

export interface Building {
  id: string;
  placeId: string;
  x: number;
  z: number;
  y: number;
  rotation: number;
  kind: 'house' | 'well' | 'market';
  asset: string;
  footprint: number;
  interaction: Interaction;
}

const CAP = { small: 6, medium: 12, large: 20 } as const;

export function layoutSettlement(place: Place, pl: Placement, field: WorldField, seed: number): { buildings: Building[]; spine: Road } {
  const rng = mulberry32(seed ^ hashString(`${place.id}:layout`));
  const angle = rng() * Math.PI;
  const dir = { x: Math.cos(angle), z: Math.sin(angle) };
  const side = { x: -dir.z, z: dir.x };
  const half = pl.radius * 0.9;
  const spine: Road = {
    points: [{ x: pl.x - dir.x * half, z: pl.z - dir.z * half }, { x: pl.x + dir.x * half, z: pl.z + dir.z * half }],
    width: 4,
    bridges: [false],
  };
  const centreKind = place.size === 'large' ? 'market' : 'well';
  const cx = pl.x + side.x * 7, cz = pl.z + side.z * 7;
  const buildings: Building[] = [{
    id: `${place.id}-centre`, placeId: place.id, x: cx, z: cz, y: field.heightAt(cx, cz),
    rotation: Math.atan2(-side.x, -side.z), kind: centreKind,
    asset: centreKind === 'market' ? 'market stall' : 'stone well', footprint: 3, interaction: 'none',
  }];
  const houseInteraction: Interaction = place.interaction !== 'none' ? place.interaction : 'door';
  let n = 0;
  for (let t = -half + 8; t <= half - 8 && n < CAP[place.size]; t += 13) {
    for (const s of [-1, 1]) {
      if (n >= CAP[place.size]) break;
      const jitter = (rng() - 0.5) * 3;
      const x = pl.x + dir.x * (t + jitter) + side.x * s * 10;
      const z = pl.z + dir.z * (t + jitter) + side.z * s * 10;
      if (Math.hypot(x - cx, z - cz) < 9) continue;
      if (Math.hypot(x - pl.x, z - pl.z) > pl.radius) continue;
      if (field.isWater(x, z) || field.slopeAt(x, z) > 0.4) continue;
      buildings.push({
        id: `${place.id}-house-${n}`, placeId: place.id, x, z, y: field.heightAt(x, z),
        rotation: Math.atan2(-side.x * s, -side.z * s), kind: 'house',
        asset: place.asset, footprint: 5, interaction: houseInteraction,
      });
      n++;
    }
  }
  return { buildings, spine };
}
