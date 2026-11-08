import { CORE_HALF, type PlaceKind, type Recipe } from '../core/recipe';
import { biomeSample, classifyBiome, groundColor, hexToRgb, type Rgb } from './biome';
import type { WorldField } from './field';
import type { Placement } from './placement';

/** Pixels across the map's picture of the land: one per 8 m of the 1 km map. */
export const MAP_RES = 128;
/** The water colour when the palette names none: the 3D water's (render/water.ts). */
const WATER: Rgb = hexToRgb('#2b6f8f');
/** Water this deep (m) is drawn darkest. */
const DEEP = 6;
/** Hill shading: how much a metre of rise per metre lightens or darkens, lit from the north-west, measured over two
 * pixels (at one, rough ground drew as speckle and washed out the land's colour). */
const SHADE = 0.35;
/** Paving this solid draws as street grey. */
const PAVED = 0.5;
const STREET: Rgb = [0.55, 0.55, 0.57];

export interface MapMarker { x: number; z: number; label: string; kind: PlaceKind }

/** Where a world point falls on a map `size` across: north (-z) up, west (-x) left. */
export function toMap(x: number, z: number, size: number): { u: number; v: number } {
  return { u: ((x + CORE_HALF) / (2 * CORE_HALF)) * size, v: ((z + CORE_HALF) / (2 * CORE_HALF)) * size };
}

/** What the land's picture depends on: a place added or moved leaves it as it was. */
export function terrainKey(r: Recipe): string {
  return JSON.stringify([r.seed, r.terrain, r.climate, r.water, r.palette ?? null]);
}

/** The colours drawn as vertex colours are linear; a 2D canvas wants them encoded, as the 3D view shows them. */
const encode = (c: number): number => Math.round(Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2) * 255);

/**
 * The land seen from above as RGBA pixels, `res` across the whole map, row 0 the north edge: ground in its biome's
 * colour (tinted by the palette, as the 3D ground is) with hill shading, streets grey, water in the world's water colour,
 * darker where deep.
 */
export function minimapPixels(field: WorldField, res = MAP_RES): Uint8ClampedArray {
  const out = new Uint8ClampedArray(res * res * 4);
  minimapRows(field, res, out, 0, res);
  return out;
}

/** Rows `from` to `to` (exclusive) of minimapPixels into `out`: a busy world takes a few hundred ms, so it is drawn a few rows a frame. */
export function minimapRows(field: WorldField, res: number, out: Uint8ClampedArray, from: number, to: number): void {
  const cell = (2 * CORE_HALF) / res;
  const palette = field.recipe.palette;
  const tint = palette?.ground ? hexToRgb(palette.ground) : undefined;
  const water = palette?.water ? hexToRgb(palette.water) : WATER;
  for (let j = from; j < Math.min(to, res); j++) {
    const z = -CORE_HALF + (j + 0.5) * cell;
    for (let i = 0; i < res; i++) {
      const x = -CORE_HALF + (i + 0.5) * cell;
      let c: Rgb;
      if (field.isWater(x, z)) {
        const depth = (field.waterSurfaceAt(x, z) ?? field.heightAt(x, z)) - field.heightAt(x, z);
        const k = 1 - 0.4 * Math.min(1, Math.max(0, depth / DEEP));
        c = [water[0] * k, water[1] * k, water[2] * k];
      } else {
        const ground = field.pavedAt(x, z) > PAVED ? STREET : groundColor(classifyBiome(biomeSample(field, x, z)), tint);
        const rise = (field.heightAt(x + cell, z + cell) - field.heightAt(x - cell, z - cell)) / (2 * cell);
        const k = Math.min(1.2, Math.max(0.75, 1 - rise * SHADE));
        c = [ground[0] * k, ground[1] * k, ground[2] * k];
      }
      const o = (j * res + i) * 4;
      out[o] = encode(c[0]);
      out[o + 1] = encode(c[1]);
      out[o + 2] = encode(c[2]);
      out[o + 3] = 255;
    }
  }
}

/** One marker per placed place, named as the world names it. */
export function mapMarkers(recipe: Recipe, placements: Placement[]): MapMarker[] {
  return placements.flatMap((p) => {
    const place = recipe.places.find((q) => q.id === p.id);
    return place ? [{ x: p.x, z: p.z, label: place.label, kind: place.kind }] : [];
  });
}
