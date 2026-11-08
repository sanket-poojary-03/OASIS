import { describe, expect, it } from 'vitest';
import { recipeSchema, type Recipe } from '../../src/core/recipe';
import { buildWorld } from '../../src/world/build';
import { computeChunk, cropColour, grassChunk } from '../../src/world/chunkData';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { findPath } from '../../src/world/roads';
import { scatterChunk } from '../../src/world/scatter';

const base = {
  version: 1, title: 't', seed: 1086, terrain: { shape: 'hills', roughness: 0.25, height: 0.2, seaLevel: 0 }, climate: { temperature: 0.62, moisture: 0.44 },
  water: { river: true, lake: true }, atmosphere: { time: 'day', weather: 'clear', fog: 0.05, wind: 0.3 }, paths: [], life: [],
};
const recipe = (places: unknown[], extra: Record<string, unknown> = {}): Recipe => recipeSchema.parse({ ...base, ...extra, places });
const village = (where: unknown[] = [{ rel: 'at', x: -262, z: 24 }]) => ({ id: 'village', kind: 'settlement', label: 'Village', asset: 'medieval cottage', size: 'medium', where });
const chunksAround = (x: number, z: number) => [-1, 0, 1].flatMap((dz) => [-1, 0, 1].map((dx) => [Math.floor(x / 64) + dx, Math.floor(z / 64) + dz]));

describe('a settlement is lived in', () => {
  const w = buildWorld(recipe([village()]));
  const pl = w.placements[0];
  const f = w.field;

  it('things grow on its open ground, but never on a building\'s plot or a road', () => {
    const inside = chunksAround(pl.x, pl.z).flatMap(([cx, cz]) => scatterChunk(f, cx, cz)).filter((s) => Math.hypot(s.x - pl.x, s.z - pl.z) < pl.radius * 0.7);
    expect(inside.length).toBeGreaterThan(10);
    const grass = chunksAround(pl.x, pl.z).flatMap(([cx, cz]) => [...grassChunk(f, cx, cz)]);
    let tufts = 0;
    for (let i = 0; i < grass.length; i += 5) if (Math.hypot(grass[i] - pl.x, grass[i + 2] - pl.z) < pl.radius * 0.7) tufts++;
    expect(tufts).toBeGreaterThan(100);
    for (const s of inside) {
      expect(f.isOnRoad(s.x, s.z, 1.5)).toBe(false);
      for (const b of w.buildings) expect(Math.hypot(s.x - b.x, s.z - b.z)).toBeGreaterThan(5);
    }
  });

  it('a landmark\'s pad still keeps everything off it', () => {
    const f2 = createField(recipe([]));
    f2.addPad({ x: 0, z: 0, radius: 10, y: 20 });
    f2.addPad({ x: 100, z: 0, radius: 10, y: 20, open: true });
    expect(f2.isReserved(0, 0, 0)).toBe(true);
    expect(f2.isReserved(100, 0, 0)).toBe(false);
    expect(f2.inSettlement(100, 0)).toBe(true);
    f2.addPlot({ x: 100, z: 0, radius: 3 });
    expect(f2.isReserved(100, 0, 0)).toBe(true);
    expect(f2.isReserved(100, 8, 0)).toBe(false);
  });

  it('works farm fields that stand clear of its houses, roads and water, and carries them to the land builders', () => {
    expect(f.crops.length).toBeGreaterThan(0);
    for (const c of f.crops) {
      expect(f.isWater(c.x, c.z)).toBe(false);
      for (const b of w.buildings) expect(Math.abs(b.x - c.x) < c.halfX && Math.abs(b.z - c.z) < c.halfZ).toBe(false);
    }
    const c = f.crops[0];
    expect(f.cropAt(c.x, c.z)).toEqual(c);
    expect(f.cropAt(c.x + c.halfX + 1, c.z)).toBeNull();
  });

  it('draws a field in rows, and grows nothing else on it', () => {
    expect(cropColour(0, 0)).not.toEqual(cropColour(0, 2));
    expect(cropColour(0, 0)).toEqual(cropColour(0, 4));
    const c = f.crops[0], cx = Math.floor(c.x / 64), cz = Math.floor(c.z / 64);
    for (const s of scatterChunk(f, cx, cz)) expect(f.cropAt(s.x, s.z)).toBeNull();
    const chunk = computeChunk(f, cx, cz);
    for (let i = 0; i < chunk.grass.length; i += 5) expect(f.cropAt(chunk.grass[i], chunk.grass[i + 2])).toBeNull();
  });

  it('a desert village has no wheat', () => {
    const dry = buildWorld(recipe([village([])], { climate: { temperature: 0.9, moisture: 0.05 } }));
    expect(dry.field.crops).toEqual([]);
  });

  it('country roads stay dirt when a city shares the world, and only roads to the city are asphalt', () => {
    const both = buildWorld(recipe([village(), { id: 'city', kind: 'settlement', label: 'City', asset: 'glass skyscraper', size: 'large', where: [{ rel: 'at', x: 208, z: -208 }], layout: { pattern: 'grid', count: 16, height: 'tall' } }]));
    expect(both.roads.some((r) => r.paved)).toBe(true);
    expect(both.roads.some((r) => !r.paved)).toBe(true);
  });
});

describe('a city has parks', () => {
  const w = buildWorld(recipe([{ id: 'city', kind: 'settlement', label: 'City', asset: 'glass skyscraper', size: 'large', where: [{ rel: 'at', x: 208, z: -208 }], layout: { pattern: 'grid', count: 36, height: 'tall', centre: 'fountain' } }]));
  const f = w.field, pl = w.placements[0], paved = f.paved[0];

  it('its empty lots are unpaved, its streets and building lots are not', () => {
    expect(paved.parks!.length).toBeGreaterThan(0);
    const c = Math.cos(paved.angle), s = Math.sin(paved.angle);
    for (const k of paved.parks!) {
      const x = pl.x + k.u * c - k.v * s, z = pl.z + k.u * s + k.v * c;
      expect(f.pavedAt(x, z)).toBe(0);
      expect(f.inPark(x, z)).toBe(true);
    }
    for (const b of w.buildings.filter((m) => m.kind === 'house')) expect(f.pavedAt(b.x, b.z)).toBe(1);
  });

  it('grows trees in them and nowhere else in the city', () => {
    const items = chunksAround(pl.x, pl.z).flatMap(([cx, cz]) => scatterChunk(f, cx, cz));
    expect(items.filter((i) => f.inPark(i.x, i.z)).length).toBeGreaterThan(3);
    for (const i of items) expect(f.pavedAt(i.x, i.z)).toBe(0);
  });
});

describe('water stays where it belongs', () => {
  const lakeWorld = createField(recipe([]));

  it('a river ends in its lake instead of wandering on under it', () => {
    const l = lakeWorld.lakes[0];
    expect(l).toBeDefined();
    const inside = lakeWorld.river.filter((p) => Math.hypot(p.x - l.x, p.z - l.z) < l.radius);
    expect(inside.length).toBeLessThanOrEqual(3); // it overlaps the lake's edge by a step or two, so the surfaces join
    const last = lakeWorld.river[lakeWorld.river.length - 1];
    expect(Math.hypot(last.x - l.x, last.z - l.z)).toBeGreaterThan(l.radius * 0.5);
  });

  it('no dry channel rings a lake: everything just past its shore is dry land', () => {
    const l = lakeWorld.lakes[0];
    const last = lakeWorld.river[lakeWorld.river.length - 1];
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const x = l.x + Math.cos(a) * l.radius * 1.15, z = l.z + Math.sin(a) * l.radius * 1.15;
      // Only where the river itself comes in is there water past the shore.
      if (Math.hypot(x - last.x, z - last.z) < 40) continue;
      expect(lakeWorld.isWater(x, z), `wet at ${a.toFixed(1)}`).toBe(false);
    }
  });

  it('a settlement is never placed with a river running through it', () => {
    for (const seed of [1086, 1088, 1105, 4821]) {
      const r = recipe([{ id: 'town', kind: 'settlement', label: 'Town', asset: 'glass skyscraper', size: 'large', where: [{ rel: 'flat' }], layout: { pattern: 'grid', count: 36, height: 'tall' } }], { seed });
      const f = createField(r);
      const pl = solvePlacements(r, f)[0];
      if (pl.warnings.length) continue; // no dry spot anywhere: the relaxed search is allowed to say so
      for (let d = 0; d <= pl.radius; d += pl.radius / 2) for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        expect(f.isWater(pl.x + Math.cos(a) * d, pl.z + Math.sin(a) * d), `seed ${seed}`).toBe(false);
      }
    }
  });

  it('a road reaches exactly what it joins', () => {
    const f = createField(recipe([]));
    const from = { x: -103, z: 21 }, to = { x: 61, z: -77 };
    const road = findPath(f, from, to)!;
    expect(road.points[0]).toEqual(from);
    expect(road.points[road.points.length - 1]).toEqual(to);
  });
});
