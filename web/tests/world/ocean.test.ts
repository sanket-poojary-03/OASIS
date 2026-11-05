import { BED_KINDS } from '../../src/world/waterDepth';
import { describe, expect, it } from 'vitest';
import { recipeSchema } from '../../src/core/recipe';
import { buildWorld } from '../../src/world/build';
import { isWatercraft } from '../../src/world/layouts';
import { computeChunk } from '../../src/world/chunkData';
import { loadRecipeFixture } from '../fixtures';

const recipe = (extra: object = {}) => recipeSchema.parse({
  ...loadRecipeFixture('tropical-island'),
  terrain: { shape: 'ocean', roughness: 0.3, height: 0.3, seaLevel: 0.6 },
  water: { river: true, lake: true }, // ignored: an ocean has neither
  places: [
    { id: 'market', kind: 'settlement', label: 'Floating market', asset: 'stilt hut', size: 'medium', layout: { pattern: 'ring', count: 8, height: 'low' } },
    { id: 'kelp', kind: 'settlement', label: 'Kelp', asset: 'kelp cluster', size: 'small', layout: { pattern: 'scatter', count: 6, height: 'low' }, where: [{ rel: 'near', target: 'market', maxDist: 80 }] },
    { id: 'light', kind: 'landmark', label: 'Lighthouse', asset: 'lighthouse', size: 'medium', where: [{ rel: 'near', target: 'market', maxDist: 120 }] },
  ],
  paths: [],
  ...extra,
});

describe('ocean world', () => {
  it('has no land: everything above the sea is a deck', () => {
    const w = buildWorld(recipe());
    const f = w.field;
    let decks = 0, n = 0;
    for (let x = -512; x <= 512; x += 16) for (let z = -512; z <= 512; z += 16) {
      n++;
      if (f.isDeck(x, z)) { decks++; expect(f.heightAt(x, z)).toBe(f.deckY); }
      else expect(f.isWater(x, z)).toBe(true);
    }
    expect(decks / n).toBeLessThan(0.1);
    expect(f.river.length).toBe(0);
    expect(f.lakes.length).toBe(0);
  });

  it('keeps its sea even if the AI wrote seaLevel 0', () => {
    const w = buildWorld(recipe({ terrain: { shape: 'ocean', roughness: 0.3, height: 0.3, seaLevel: 0 } }));
    expect(w.field.hasSea).toBe(true);
    expect(w.field.isWater(400, 400)).toBe(true);
  });

  it('starts you on a deck touching the main place, facing it', () => {
    const w = buildWorld(recipe());
    const f = w.field, s = w.spawn;
    expect(f.isDeck(s.x, s.z)).toBe(true);
    expect(f.isWater(s.x, s.z)).toBe(false);
    expect(s.y).toBeGreaterThan(f.seaLevelY);
    const market = w.placements.find((p) => p.id === 'market')!;
    const fx = -Math.sin(s.yaw!), fz = -Math.cos(s.yaw!), d = Math.hypot(market.x - s.x, market.z - s.z);
    expect((fx * (market.x - s.x) + fz * (market.z - s.z)) / d).toBeGreaterThan(0.99);
    // Straight ahead there is deck all the way onto the main place.
    for (let t = 0; t <= 1; t += 0.02) expect(f.isDeck(s.x + (market.x - s.x) * t, s.z + (market.z - s.z) * t)).toBe(true);
    expect(w.roads.every((r) => !r.paved)).toBe(true);
  });

  it('sizes decks to what stands on them', () => {
    const w = buildWorld(recipe({ places: [{ id: 'village', kind: 'settlement', label: 'Village', asset: 'stilt hut', size: 'large' }], paths: [] }));
    const v = w.placements[0];
    expect(v.radius).toBeLessThan(60);
    expect(w.buildings.filter((b) => b.kind === 'house').length).toBeGreaterThanOrEqual(8);
    for (const b of w.buildings) expect(w.field.isDeck(b.x, b.z)).toBe(true);
  });

  it('joins separate decks with boardwalks over the water', () => {
    const w = buildWorld(recipe());
    expect(w.roads.some((r) => r.bridges.some(Boolean))).toBe(true);
  });

  it('puts group members on their deck, and floats a scatter on the sea', () => {
    const w = buildWorld(recipe());
    const f = w.field;
    const huts = w.buildings.filter((b) => b.placeId === 'market' && b.kind === 'house');
    expect(huts.length).toBeGreaterThan(0);
    for (const h of huts) { expect(f.isDeck(h.x, h.z)).toBe(true); expect(h.y).toBe(f.deckY); }
    const kelp = w.buildings.filter((b) => b.placeId === 'kelp');
    expect(kelp.length).toBeGreaterThan(0);
    for (const k of kelp) { expect(f.isWater(k.x, k.z)).toBe(true); expect(k.y).toBeCloseTo(f.seaLevelY - 0.2); }
    expect(w.placements.find((p) => p.id === 'light')!.y).toBe(f.deckY);
  });

  it('grows nothing but what lies on a sea bed, and no terrain ever rises above the sea, not even under a deck', () => {
    const w = buildWorld(recipe());
    const s = w.spawn, market = w.placements.find((p) => p.id === 'market')!;
    for (const [x, z] of [[s.x, s.z], [market.x, market.z], [448, 448]]) {
      const c = computeChunk(w.field, Math.floor(x / 64), Math.floor(z / 64));
      for (const it of c.scatter) expect(BED_KINDS).toContain(it.kind);
      expect(c.grass.length).toBe(0);
      for (let i = 1; i < c.positions.length; i += 3) expect(c.positions[i]).toBeLessThan(w.field.seaLevelY - 5);
    }
  });
});

describe('watercraft', () => {
  it('names things that float, not wrecks or spaceships', () => {
    for (const a of ['fishing boat', 'moored trawler', 'wooden raft', 'canoe', 'white yacht']) expect(isWatercraft(a)).toBe(true);
    for (const a of ['rusted cargo ship hull', 'shipwreck', 'space ship', 'airship', 'boathouse']) expect(isWatercraft(a)).toBe(false);
  });

  it('float on the water beside a harbour line, in any world', () => {
    const base = loadRecipeFixture('tropical-island');
    const w = buildWorld(recipeSchema.parse({
      ...base,
      places: [{ id: 'dock', kind: 'settlement', label: 'Dock', asset: 'fishing boat', size: 'medium', layout: { pattern: 'line', count: 8, height: 'low' }, where: [{ rel: 'by_water' }] }],
      paths: [],
    }));
    const boats = w.buildings.filter((b) => b.placeId === 'dock' && b.kind === 'house');
    expect(boats.length).toBeGreaterThan(0);
    expect(boats.filter((b) => w.field.isWater(b.x, b.z)).length).toBeGreaterThan(boats.length / 2);
  });
});
