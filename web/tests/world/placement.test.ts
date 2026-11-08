
import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { findSpawn, orderPlaces, solvePlacements } from '../../src/world/placement';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('placement', () => {
  it.each(RECIPE_FIXTURES)('%s: on land, no overlaps, not floating', (name) => {
    const recipe = loadRecipeFixture(name);
    const field = createField(recipe);
    const pls = solvePlacements(recipe, field);
    expect(pls.map((p) => p.id).sort()).toEqual(recipe.places.map((p) => p.id).sort());
    for (const p of pls) {
      expect(field.isWater(p.x, p.z)).toBe(false);
      expect(Math.abs(p.y - field.heightAt(p.x, p.z))).toBeLessThan(0.5);
      expect(p.reasons.length + p.warnings.length).toBeGreaterThan(0);
    }
    for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) {
      const a = pls[i], b = pls[j];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-6);
    }
  });

  it('is deterministic', () => {
    const r = loadRecipeFixture('fishing-valley');
    const a = solvePlacements(r, createField(r));
    const b = solvePlacements(r, createField(r));
    expect(a).toEqual(b);
  });

  it('respects relations: tower higher than village, campfire near village', () => {
    const r = loadRecipeFixture('fishing-valley');
    const pls = solvePlacements(r, createField(r));
    const v = pls.find((p) => p.id === 'village')!, t = pls.find((p) => p.id === 'tower')!, c = pls.find((p) => p.id === 'campfire')!;
    expect(t.y).toBeGreaterThan(v.y);
    expect(Math.hypot(c.x - v.x, c.z - v.z)).toBeLessThanOrEqual(v.radius + c.radius + 4 + 30 + 1);
  });

  it('honours an exact "at" position', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places.push({ id: 'marker', kind: 'prop', label: 'Marker', asset: 'stone marker', size: 'small', interaction: 'none', where: [{ rel: 'at', x: 100, z: 50 }] });
    const field = createField(r);
    const m = solvePlacements(r, field).find((p) => p.id === 'marker')!;
    expect(m.x).toBe(100);
    expect(m.z).toBe(50);
    expect(m.reasons).toContain('placed where you asked');
  });

  it('puts a prop on top of a surface when "at" carries y (e.g. a candle on a table)', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places.push({ id: 'candle', kind: 'prop', label: 'Candle', asset: 'candle', size: 'small', interaction: 'light', where: [{ rel: 'at', x: 100, z: 50, y: 123.45 }] });
    const c = solvePlacements(r, createField(r)).find((p) => p.id === 'candle')!;
    expect(c.y).toBe(123.45);
  });

  it('keeps fixed placements and orders by dependency', () => {
    const r = loadRecipeFixture('fishing-valley');
    expect(orderPlaces([...r.places].reverse()).map((p) => p.id).indexOf('village')).toBeLessThan(
      orderPlaces([...r.places].reverse()).map((p) => p.id).indexOf('campfire'),
    );
    const first = solvePlacements(r, createField(r));
    const village = first.find((p) => p.id === 'village')!;
    const again = solvePlacements(r, createField(r), [village]);
    expect(again.find((p) => p.id === 'village')).toEqual(village);
  });

  it('spawn is on dry gentle ground', () => {
    const r = loadRecipeFixture('tropical-island');
    const field = createField(r);
    const s = findSpawn(field, solvePlacements(r, field));
    expect(field.isWater(s.x, s.z)).toBe(false);
    expect(s.y).toBeGreaterThan(field.heightAt(s.x, s.z));
  });
});

describe('findSpawn fallback', () => {
  it('without settlements, falls back to dry walkable ground searched outward from (0, 0)', () => {
    const r = loadRecipeFixture('tropical-island');
    const field = createField(r);
    const props = solvePlacements(r, field).filter((p) => p.kind !== 'settlement');
    const s = findSpawn(field, props);
    expect(field.isWater(s.x, s.z)).toBe(false);
    expect(field.slopeAt(s.x, s.z)).toBeLessThan(0.5);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(200);
    const bare = findSpawn(field, []), withProps = findSpawn(field, props);
    expect([bare.x, bare.y, bare.z]).toEqual([withProps.x, withProps.y, withProps.z]);
  });

  it('starts beside the biggest settlement, on its side toward the centre, facing it', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pls = solvePlacements(r, field);
    const big = { id: 'downtown', kind: 'settlement', x: 300, y: field.heightAt(300, -300), z: -300, radius: 60, rotation: 0, reasons: [], warnings: [] } as unknown as (typeof pls)[number];
    const s = findSpawn(field, [...pls, big]);
    const d = Math.hypot(s.x - big.x, s.z - big.z);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(140);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(Math.hypot(big.x, big.z)); // on the inward side
    // Camera forward for yaw θ is (-sin θ, -cos θ): it points at the settlement.
    const fx = -Math.sin(s.yaw!), fz = -Math.cos(s.yaw!);
    expect((fx * (big.x - s.x) + fz * (big.z - s.z)) / d).toBeGreaterThan(0.99);
  });
});

describe('no-valid-spot fallback', () => {
  it('crowded world: unplaceable settlements are never wet and wet/overlapping spots get no pad', () => {
    const r = loadRecipeFixture('tropical-island');
    for (let i = 0; i < 14; i++) {
      r.places.push({ id: `town${i}`, kind: 'settlement', label: `Town ${i}`, asset: 'village', size: 'large', interaction: 'none', where: [{ rel: 'flat' }] } as never);
    }
    const field = createField(r);
    const before = field.pads.length;
    const pls = solvePlacements(r, field);
    const fallen = pls.filter((p) => p.warnings.some((w) => w.startsWith('no valid spot')));
    expect(fallen.length).toBeGreaterThan(0);
    for (const p of fallen) expect(field.isWater(p.x, p.z)).toBe(false);
    const nonProp = pls.filter((p) => p.kind !== 'prop');
    expect(field.pads.length - before).toBeLessThan(nonProp.length + 1);
    for (const pad of field.pads.slice(before)) expect(field.isWater(pad.x, pad.z)).toBe(false);
  });
});

describe('findSpawn settlement case', () => {
  it('uses the area beside a settlement, and recovers when the ring is unusable', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pls = solvePlacements(r, field);
    const s = findSpawn(field, pls);
    const v = pls.find((p) => p.kind === 'settlement')!;
    expect(field.isWater(s.x, s.z)).toBe(false);
    expect(Math.hypot(s.x - v.x, s.z - v.z)).toBeGreaterThanOrEqual(v.radius);
    const bad = { ...v, x: 0, z: 0, radius: 1e6 };
    const s2 = findSpawn(field, [bad]);
    expect(Number.isFinite(s2.y)).toBe(true);
    expect(Math.hypot(s2.x, s2.z)).toBeLessThanOrEqual(512 * 1.5);
  });
});

describe('spread', () => {
  it('sends places with no tie to another place to different parts of the world', () => {
    const base = loadRecipeFixture('fishing-valley');
    const free = Array.from({ length: 6 }, (_, i) => ({ id: `free${i}`, kind: 'structure' as const, label: `Free ${i}`, asset: 'cabin', size: 'small' as const, interaction: 'none' as const, where: [] }));
    const r = { ...base, places: free, paths: [], water: { river: false, lake: false } };
    const ps = solvePlacements(r, createField(r));
    let closest = Infinity;
    for (const a of ps) for (const b of ps) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    expect(closest).toBeGreaterThan(180);
  });
});
