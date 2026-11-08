import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/core/recipe';
import { createField, RIVER_WET, type WorldField } from '../../src/world/field';
import { waterSheet } from '../../src/world/waterSheet';
import { loadRecipeFixture } from '../fixtures';

const FIXTURES = ['snowy-mountains', 'fishing-valley', 'desert-canyon', 'tropical-island'] as const;
const SHAPES = ['mountains', 'hills', 'valley', 'canyon', 'plains'] as const;

function worlds(seaLevel: number): Array<readonly [string, WorldField]> {
  const out: Array<readonly [string, WorldField]> = [];
  for (const f of FIXTURES) for (const shape of SHAPES) {
    const r = loadRecipeFixture(f);
    const recipe: Recipe = { ...r, terrain: { ...r.terrain, shape, seaLevel }, water: { ...r.water, river: true, lake: true } };
    out.push([`${f}/${shape}/sea ${seaLevel}`, createField(recipe)]);
  }
  return out;
}
const INLAND = worlds(0);
const COASTAL = worlds(0.3);
const ALL = [...INLAND, ...COASTAL];

const CELL = 2;
/** How many triangles of the sheet fall in each 2 m cell. */
function cellsOf(field: WorldField): Map<string, number> {
  const cells = new Map<string, number>();
  for (const { positions: p, indices: ix } of waterSheet(field)) {
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      const key = `${Math.floor(Math.min(p[a], p[b], p[c]) / CELL)},${Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / CELL)}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
  }
  return cells;
}

describe('the water sheet', () => {
  it.each(ALL)('%s: covers all of its channel, on bends and at both ends', (_, field) => {
    if (field.river.length < 2) return;
    const cells = cellsOf(field);
    const xs = field.river.map((p) => p.x), zs = field.river.map((p) => p.z);
    const x0 = Math.floor(Math.min(...xs) / CELL) * CELL - 20, x1 = Math.max(...xs) + 20;
    const z0 = Math.floor(Math.min(...zs) / CELL) * CELL - 20, z1 = Math.max(...zs) + 20;
    const uncovered: string[] = [];
    for (let x = x0; x <= x1; x += CELL) for (let z = z0; z <= z1; z += CELL) {
      const cx = x + CELL / 2, cz = z + CELL / 2;
      if (field.riverDistance(cx, cz, RIVER_WET) >= RIVER_WET - 1) continue;
      if (field.lakes.some((l) => Math.hypot(cx - l.x, cz - l.z) < l.radius + 3)) continue; // the lake's own surface
      const s = field.waterSurfaceAt(cx, cz);
      if (s === null || (field.hasSea && s === field.seaLevelY)) continue; // the sea's own surface
      if (field.heightAt(cx, cz) < s && !cells.has(`${x / CELL},${z / CELL}`)) uncovered.push(`${cx},${cz}`);
    }
    expect(uncovered).toEqual([]);
  });

  it.each(ALL)('%s: is one layer: no cell drawn twice darkens the water', (_, field) => {
    for (const n of cellsOf(field).values()) expect(n).toBeLessThanOrEqual(2); // one of the two may be left to the sea
  });

  it.each(ALL)('%s: never hangs over dry ground', (_, field) => {
    for (const { positions: p } of waterSheet(field)) for (let i = 0; i < p.length; i += 3) {
      if (p[i + 1] - field.meshHeightAt(p[i], p[i + 2]) >= 0.05) expect(field.isWater(p[i], p[i + 2]), `${p[i]},${p[i + 2]}`).toBe(true);
    }
  });

  it.each(COASTAL)('%s: leaves the sea to the sea: no second surface fighting it', (_, field) => {
    for (const { positions: p, indices: ix } of waterSheet(field)) for (let i = 0; i < ix.length; i += 3) {
      const atSea = [ix[i], ix[i + 1], ix[i + 2]].every((v) => Math.abs(p[v * 3 + 1] - field.seaLevelY) < 0.001);
      expect(atSea).toBe(false);
    }
  });

  it.each(ALL)('%s: covers its lakes too, so a river and its lake are one surface', (_, field) => {
    const cells = cellsOf(field);
    for (const l of field.lakes) for (let a = 0; a < 24; a++) for (const k of [0, 0.5, 0.9]) {
      const x = l.x + Math.cos((a / 24) * Math.PI * 2) * l.radius * k, z = l.z + Math.sin((a / 24) * Math.PI * 2) * l.radius * k;
      expect(cells.has(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`), `${k} r at ${x},${z}`).toBe(true);
    }
  });

  it.each(ALL)('%s: a lake is flat, at its own level', (_, field) => {
    for (const { positions: p } of waterSheet(field)) for (let i = 0; i < p.length; i += 3) {
      const l = field.lakes.find((k) => Math.hypot(p[i] - k.x, p[i + 2] - k.z) < k.radius);
      if (l) expect(p[i + 1]).toBeCloseTo(l.levelY, 5);
    }
  });

  it('is deterministic', () => {
    const field = ALL.find(([, f]) => f.river.length > 1)![1];
    expect(waterSheet(field)).toEqual(waterSheet(field));
  });
});

describe('water meets the sea', () => {
  it.each(COASTAL)('%s: nothing under the sea is raised out of it', (_, field) => {
    const raised: string[] = [];
    for (let x = -508; x <= 508; x += 6) for (let z = -508; z <= 508; z += 6) {
      if (field.baseHeight(x, z) < field.seaLevelY - 0.2 && field.heightAt(x, z) > field.seaLevelY) raised.push(`${x},${z}`);
    }
    expect(raised).toEqual([]);
  });

  it.each(COASTAL)('%s: a river stops at the shore, it does not run on across the sea', (_, field) => {
    const under = field.river.filter((p) => field.baseHeight(p.x, p.z) < field.seaLevelY);
    expect(under.length).toBeLessThanOrEqual(4);
  });

  it.each(COASTAL)('%s: a river reaches the sea at the height of the sea', (_, field) => {
    for (const p of field.river) if (field.baseHeight(p.x, p.z) < field.seaLevelY) expect(field.riverLevelAt(p.x, p.z)).toBeCloseTo(field.seaLevelY, 5);
  });
});

describe('a lake sits in the land', () => {
  it.each(ALL)('%s: no dry ground around it lies lower than its water', (_, field) => {
    for (const l of field.lakes) for (let a = 0; a < 48; a++) for (const k of [1.02, 1.1, 1.2, 1.3]) {
      const x = l.x + Math.cos((a / 48) * Math.PI * 2) * l.radius * k, z = l.z + Math.sin((a / 48) * Math.PI * 2) * l.radius * k;
      if (field.isWater(x, z)) continue; // the river running in
      expect(field.heightAt(x, z), `${k} r at ${x},${z}`).toBeGreaterThanOrEqual(l.levelY);
    }
  });

  it.each(ALL)('%s: a river enters it with no sill of ground across the mouth', (_, field) => {
    for (const l of field.lakes) for (let i = 1; i < field.river.length; i++) {
      const a = field.river[i - 1], b = field.river[i];
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, dl = Math.hypot(x - l.x, z - l.z);
        if (dl > l.radius * 0.85 && dl < l.radius * 1.1) expect(l.levelY - field.heightAt(x, z), `${dl / l.radius} r at ${x},${z}`).toBeGreaterThan(1);
      }
    }
  });

  it.each(COASTAL)('%s: all of it lies on land, clear of the sea', (_, field) => {
    for (const l of field.lakes) for (let a = 0; a < 16; a++) {
      const x = l.x + Math.cos((a / 16) * Math.PI * 2) * l.radius * 1.4, z = l.z + Math.sin((a / 16) * Math.PI * 2) * l.radius * 1.4;
      expect(field.baseHeight(x, z)).toBeGreaterThan(field.seaLevelY);
    }
  });
});

describe('a traced river curves', () => {
  const turn = (a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }) => {
    const ux = b.x - a.x, uz = b.z - a.z, vx = c.x - b.x, vz = c.z - b.z;
    return Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz));
  };

  it('has no kink: straight runs and sharp corners draw straight banks that meet in a spike', () => {
    const traced = INLAND.filter(([name]) => name.includes('/hills/') || name.includes('/plains/')).map(([, f]) => f).filter((f) => f.river.length > 4);
    expect(traced.length).toBeGreaterThan(0);
    for (const f of traced) for (let i = 1; i < f.river.length - 1; i++) expect(turn(f.river[i - 1], f.river[i], f.river[i + 1])).toBeLessThan(Math.PI / 8);
  });
});
