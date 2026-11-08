import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { mapMarkers, minimapPixels, minimapRows, terrainKey, toMap } from '../../src/world/minimap';
import { CORE_HALF } from '../../src/core/recipe';
import { loadRecipeFixture } from '../fixtures';

const RES = 48;
const pixel = (px: Uint8ClampedArray, i: number, j: number) => [...px.slice((j * RES + i) * 4, (j * RES + i) * 4 + 4)];
const centre = (i: number) => -CORE_HALF + ((i + 0.5) * 2 * CORE_HALF) / RES;

describe('minimap', () => {
  it('north (-z) is up and west (-x) is left, across the whole 1 km map', () => {
    expect(toMap(-CORE_HALF, -CORE_HALF, 200)).toEqual({ u: 0, v: 0 });
    expect(toMap(CORE_HALF, CORE_HALF, 200)).toEqual({ u: 200, v: 200 });
    expect(toMap(0, -CORE_HALF / 2, 200)).toEqual({ u: 100, v: 50 });
  });

  it('drawn a few rows at a time, the picture is the same as drawn at once', () => {
    const field = createField(loadRecipeFixture('snowy-mountains'));
    const out = new Uint8ClampedArray(RES * RES * 4);
    for (let row = 0; row < RES; row += 5) minimapRows(field, RES, out, row, row + 5);
    expect(out).toEqual(minimapPixels(field, RES));
  });

  it('draws every pixel opaque, the same way each time for the same world', () => {
    const r = loadRecipeFixture('fishing-valley');
    const a = minimapPixels(createField(r), RES), b = minimapPixels(createField(r), RES);
    expect(a.length).toBe(RES * RES * 4);
    expect(a).toEqual(b);
    for (let k = 3; k < a.length; k += 4) expect(a[k]).toBe(255);
  });

  it('water takes the world\'s water colour and land its ground colour, so a purple world reads purple', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.palette = { ground: '#ff2020', water: '#20ff20' };
    const field = createField(r);
    const px = minimapPixels(field, RES);
    let wet = 0, dry = 0;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const [red, green] = pixel(px, i, j);
      if (field.isWater(centre(i), centre(j))) { wet++; expect(green).toBeGreaterThan(red); } else if (field.slopeAt(centre(i), centre(j)) < 0.3) { dry++; expect(red).toBeGreaterThan(green); }
    }
    expect(wet).toBeGreaterThan(0);
    expect(dry).toBeGreaterThan(0);
  });

  it('marks every place with its name and kind', () => {
    const r = loadRecipeFixture('fishing-valley');
    const markers = mapMarkers(r, solvePlacements(r, createField(r)));
    expect(markers).toHaveLength(r.places.length);
    for (const m of markers) expect(r.places.find((p) => p.label === m.label)?.kind).toBe(m.kind);
  });

  it('the land only needs drawing again when the land itself changes, not when a place is added', () => {
    const r = loadRecipeFixture('fishing-valley');
    const added = { ...r, places: [...r.places, { ...r.places[0], id: 'extra' }] };
    expect(terrainKey(added)).toBe(terrainKey(r));
    expect(terrainKey({ ...r, palette: { water: '#7a2cff' } })).not.toBe(terrainKey(r));
    expect(terrainKey({ ...r, climate: { ...r.climate, temperature: 0.05 } })).not.toBe(terrainKey(r));
  });
});
