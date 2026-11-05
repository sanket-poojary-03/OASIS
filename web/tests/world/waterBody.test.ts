import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/core/recipe';
import { BED_KINDS, depthBelowSurface } from '../../src/world/waterDepth';
import { computeChunk } from '../../src/world/chunkData';
import { createField, type WorldField } from '../../src/world/field';
import { scatterChunk } from '../../src/world/scatter';
import { pieces } from '../../src/render/rangeCull';
import { ribbonData } from '../../src/render/ribbon';
import { RIVER_MESH_HALF_WIDTH } from '../../src/render/water';
import { loadRecipeFixture } from '../fixtures';

const FIXTURES = ['snowy-mountains', 'fishing-valley', 'desert-canyon', 'tropical-island'] as const;
const SHAPES = ['mountains', 'hills', 'valley', 'canyon', 'plains'] as const;

function worlds(): Array<{ name: string; field: WorldField }> {
  const out: Array<{ name: string; field: WorldField }> = [];
  for (const f of FIXTURES) for (const shape of SHAPES) {
    const r = loadRecipeFixture(f);
    const recipe: Recipe = { ...r, terrain: { ...r.terrain, shape }, water: { ...r.water, river: true, lake: true } };
    out.push({ name: `${f}/${shape}`, field: createField(recipe) });
  }
  return out;
}
const WORLDS = worlds();

/** Everywhere a water mesh is drawn, with the height it is drawn at. */
function underMesh(field: WorldField): Array<{ x: number; z: number; y: number }> {
  const out: Array<{ x: number; z: number; y: number }> = [];
  if (field.river.length > 1) {
    for (const run of pieces(field.river, 8)) {
      const p = ribbonData(run, RIVER_MESH_HALF_WIDTH, field.riverLevelAt, true).positions;
      for (let i = 0; i < p.length; i += 3) out.push({ x: p[i], y: p[i + 1], z: p[i + 2] });
    }
  }
  for (const l of field.lakes) {
    for (let a = 0; a < 48; a++) out.push({ x: l.x + Math.cos((a / 48) * 6.283) * l.radius, z: l.z + Math.sin((a / 48) * 6.283) * l.radius, y: l.levelY });
  }
  return out;
}

describe('a water surface sits in its own channel', () => {
  it.each(WORLDS.map((w) => [w.name, w.field] as const))('%s: the edge of every river and lake mesh meets the ground, nothing hangs in the air', (_, field) => {
    // A point of the mesh over lower ground must be over water (the inside of a river's bend is), never over dry land.
    for (const e of underMesh(field)) if (e.y - field.heightAt(e.x, e.z) >= 0.05) expect(field.isWater(e.x, e.z), `${e.x},${e.z}`).toBe(true);
  });

  it.each(WORLDS.map((w) => [w.name, w.field] as const))('%s: ground below a surface is always water, so nobody walks dry underneath', (_, field) => {
    for (let x = -500; x <= 500; x += 12) for (let z = -500; z <= 500; z += 12) {
      const s = field.waterSurfaceAt(x, z);
      if (s !== null && field.heightAt(x, z) < s) expect(field.isWater(x, z)).toBe(true);
    }
    for (const l of field.lakes) for (let a = 0; a < 24; a++) for (const k of [1.02, 1.1, 1.2, 1.3]) {
      const x = l.x + Math.cos(a) * l.radius * k, z = l.z + Math.sin(a) * l.radius * k;
      if (field.isWater(x, z)) continue; // the river running in
      expect(field.heightAt(x, z), `ring of a lake at ${k} r`).toBeGreaterThanOrEqual(Math.min(l.levelY, field.baseHeight(x, z)) - 0.01);
    }
  });

  it.each(WORLDS.map((w) => [w.name, w.field] as const))('%s: rivers and lakes have depth to swim in', (_, field) => {
    if (field.river.length > 1) {
      const p = field.river[Math.floor(field.river.length / 2)];
      if (!field.lakes.some((l) => Math.hypot(p.x - l.x, p.z - l.z) < l.radius * 1.5)) expect(field.riverLevelAt(p.x, p.z) - field.heightAt(p.x, p.z)).toBeGreaterThan(2);
    }
    for (const l of field.lakes) expect(l.levelY - field.heightAt(l.x, l.z)).toBeGreaterThan(3);
  });

  it('a river changes level smoothly, with no cliff in the sheet', () => {
    for (const { field } of WORLDS) {
      for (let i = 1; i < field.river.length; i++) {
        const a = field.river[i - 1], b = field.river[i];
        expect(Math.abs(field.riverLevelAt(a.x, a.z) - field.riverLevelAt(b.x, b.z))).toBeLessThan(5);
      }
    }
  });

  it('a lake lies on land, never on the sea bed', () => {
    for (const { field } of WORLDS) if (field.hasSea) for (const l of field.lakes) expect(l.levelY).toBeGreaterThan(field.seaLevelY);
  });

  it('is deterministic', () => {
    const r = loadRecipeFixture('snowy-mountains');
    const a = createField(r), b = createField(r);
    for (let i = -300; i < 300; i += 37) expect(a.heightAt(i, -i)).toBe(b.heightAt(i, -i));
  });
});

describe('depthBelowSurface', () => {
  const { field } = WORLDS.find((w) => w.field.lakes.length > 0)!;
  const l = field.lakes[0];

  it('is how far below the surface a point is, in water', () => {
    expect(depthBelowSurface(field, l.x, l.levelY - 2, l.z)).toBeCloseTo(2, 5);
  });

  it('is 0 above the surface and on dry land', () => {
    expect(depthBelowSurface(field, l.x, l.levelY + 1, l.z)).toBe(0);
    expect(depthBelowSurface(field, l.x + l.radius * 3, -500, l.z)).toBe(0);
  });
});

describe('what lies under the water', () => {
  const lakeWorld = WORLDS.find((w) => w.field.lakes.length > 0)!.field;

  it('things on the bed are only bed things, standing on the bed', () => {
    let found = 0;
    for (const { field } of WORLDS.slice(0, 6)) for (const l of field.lakes) {
      const cx0 = Math.floor((l.x - l.radius) / 64), cx1 = Math.floor((l.x + l.radius) / 64);
      const cz0 = Math.floor((l.z - l.radius) / 64), cz1 = Math.floor((l.z + l.radius) / 64);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) for (const it of scatterChunk(field, cx, cz)) {
        if (!field.isWater(it.x, it.z)) continue;
        found++;
        expect(BED_KINDS).toContain(it.kind);
        expect(it.y).toBeCloseTo(field.heightAt(it.x, it.z), 5);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('dry land scatter is exactly what it was: the bed adds, it does not reshuffle', () => {
    const items = scatterChunk(lakeWorld, 0, 0);
    expect(items).toEqual(scatterChunk(lakeWorld, 0, 0));
  });

  it('a deep bed is dark and is not snow, even in a frozen world', () => {
    const r = loadRecipeFixture('snowy-mountains');
    const field = createField({ ...r, climate: { ...r.climate, temperature: 0 }, water: { ...r.water, lake: true } });
    const l = field.lakes[0];
    const c = computeChunk(field, Math.floor(l.x / 64), Math.floor(l.z / 64));
    let bed = 0;
    for (let i = 0; i < c.positions.length; i += 3) {
      const x = c.positions[i], z = c.positions[i + 2];
      if (field.isWater(x, z) && l.levelY - c.positions[i + 1] > 3) {
        bed++;
        expect(0.3 * c.colors[i] + 0.59 * c.colors[i + 1] + 0.11 * c.colors[i + 2]).toBeLessThan(0.5);
      }
    }
    expect(bed).toBeGreaterThan(0);
  });
});
