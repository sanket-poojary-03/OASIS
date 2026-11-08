import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundledAsset, bundledKey } from '../../src/api/bundled';
import type { PlaceKind } from '../../src/core/recipe';
import { SCATTER_ART } from '../../src/render/artLoader';
import { drawnVariants } from '../../src/render/scatterAssets';
import { menuLength, menuShot } from '../../src/ui/menuFlight';
import { MENU_BEATS, showcaseRecipe } from '../../src/ui/showcase';
import { buildWorld } from '../../src/world/build';
import { towerFacade } from '../../src/world/towerSpec';

const where = new Map([['village', { x: -200, y: 30, z: 0 }], ['city', { x: 200, y: 20, z: -100 }]]);

describe('the menu flight', () => {
  it('starts on the village by day', () => {
    const s = menuShot(MENU_BEATS, where, 0);
    expect(s).toMatchObject({ x: -200, z: 0 });
    expect(s.hours).toBeGreaterThan(9);
    expect(s.hours).toBeLessThan(18);
  });

  it('loops without a jump: the last beat is the first, one day later', () => {
    const first = MENU_BEATS[0], last = MENU_BEATS[MENU_BEATS.length - 1];
    expect(last.focus).toBe(first.focus);
    expect(last.hours).toBe(first.hours + 24);
    const end = menuShot(MENU_BEATS, where, menuLength(MENU_BEATS) - 0.001), start = menuShot(MENU_BEATS, where, 0);
    for (const key of ['x', 'y', 'z', 'radius', 'height', 'look', 'shadow'] as const) expect(end[key]).toBeCloseTo(start[key], 1);
    expect(end.hours).toBeCloseTo(start.hours, 1);
  });

  it('never jumps anywhere along the way', () => {
    const step = 0.05;
    for (let t = 0; t < menuLength(MENU_BEATS) * 2; t += step) {
      const a = menuShot(MENU_BEATS, where, t), b = menuShot(MENU_BEATS, where, t + step);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(3);
      expect(Math.abs(b.radius - a.radius)).toBeLessThan(1);
      expect(Math.abs(b.height - a.height)).toBeLessThan(1);
      const dh = Math.abs(b.hours - a.hours);
      expect(Math.min(dh, 24 - dh)).toBeLessThan(0.1);
    }
  });

  it('shows the village, the city and the night, in that order', () => {
    const seen = MENU_BEATS.map((b) => b.focus);
    expect(seen.indexOf('village')).toBe(0);
    expect(seen).toContain('city');
    expect(MENU_BEATS.some((b) => b.focus === 'village' && b.hours % 24 > 20)).toBe(true);
    expect(MENU_BEATS.some((b) => b.focus === 'city' && (b.hours % 24 > 20 || b.hours % 24 < 5))).toBe(true);
    expect(MENU_BEATS.some((b) => b.focus === 'city' && b.hours % 24 > 8 && b.hours % 24 < 17)).toBe(true);
  });
});

describe('the menu world', () => {
  const w = buildWorld(showcaseRecipe());
  const field = w.field;

  it('names every place the camera visits', () => {
    for (const b of MENU_BEATS) expect(w.placements.some((p) => p.id === b.focus), b.focus).toBe(true);
  });

  it('has no water anywhere in the village or the city', () => {
    for (const id of ['village', 'city']) {
      const p = w.placements.find((q) => q.id === id)!;
      for (let d = 0; d <= p.radius; d += 6) for (let a = 0; a < Math.PI * 2; a += 0.2) {
        expect(field.isWater(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d), `${id} wet at ${a.toFixed(1)}, ${d}`).toBe(false);
      }
    }
  });

  it('every building stands on dry ground, off every road', () => {
    const houses = w.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBeGreaterThan(30);
    for (const h of houses) {
      expect(field.isWater(h.x, h.z)).toBe(false);
      expect(field.isOnRoad(h.x, h.z, h.footprint / 2), h.id).toBe(false);
    }
  });

  it('every placed thing got the spot it asked for', () => {
    // The city asks for a spot big enough that the land under it is levelled: the rest stand on ground as it is.
    for (const p of w.placements) if (p.id !== 'city') expect(p.warnings, p.id).toEqual([]);
  });

  it('the village works farm fields', () => {
    expect(field.crops.length).toBeGreaterThan(1);
    for (const c of field.crops) expect(field.isWater(c.x, c.z)).toBe(false);
  });

  it('needs no server: every model it asks for ships with the site', () => {
    const variantOf = (id: string) => Number(id.split('-').pop()) || 0;
    const wanted: Array<[string, PlaceKind, number]> = [];
    for (const p of w.recipe.places) if (p.kind !== 'settlement' && !towerFacade(p.asset, false, false)) wanted.push([p.asset, p.kind, 0]);
    for (const b of w.buildings) {
      const place = w.recipe.places.find((p) => p.id === b.placeId)!;
      if (b.kind === 'house' && towerFacade(b.asset, !!place.layout, place.layout?.pattern === 'grid')) continue;
      wanted.push([b.asset, 'structure', 0], [b.asset, 'structure', variantOf(b.id)]);
    }
    for (const e of w.extras) wanted.push([e.asset, 'prop', 0], [e.asset, 'prop', variantOf(e.id)]);
    for (const s of w.scenery) wanted.push([s.asset, s.kind === 'prop' ? 'prop' : 'structure', variantOf(s.id)]);
    for (const l of w.recipe.life) if (l.asset) wanted.push([l.asset, 'prop', 0]);
    for (const a of SCATTER_ART) for (let v = 0; v < drawnVariants(a.kind); v++) wanted.push([a.query, 'prop', v]);
    wanted.push(['deer', 'prop', 0]);
    expect(wanted.length).toBeGreaterThan(50);
    for (const [asset, kind, variant] of wanted) {
      const hit = bundledAsset(asset, kind, variant);
      expect(hit, bundledKey(asset, kind, variant)).not.toBeNull();
      expect(existsSync(`public${hit!.url}`), hit!.url).toBe(true);
    }
  });

  it('every animal has somewhere to be: its herd stands on free, dry ground', () => {
    for (const life of w.recipe.life) {
      if (!life.at) continue;
      expect(field.isWater(life.at.x, life.at.z)).toBe(false);
      expect(field.isReserved(life.at.x, life.at.z, 2)).toBe(false);
    }
  });
});
