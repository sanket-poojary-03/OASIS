import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/core/recipe';
import { drawnRoad } from '../../src/render/roads';
import { buildWorld } from '../../src/world/build';
import type { Road, WorldField } from '../../src/world/field';
import { createField } from '../../src/world/field';
import { CLIFF, findRoad, MAX_SPAN, WALL } from '../../src/world/roads';
import { loadRecipeFixture } from '../fixtures';

const canyon = (seed: number, river = true): Recipe => {
  const r = loadRecipeFixture('desert-canyon');
  return { ...r, seed, water: { ...r.water, river } };
};
const SEEDS = [9137, 11, 2026, 77, 4242];

/** Across the canyon at `z`, from one rim to the other. */
const rims = (field: WorldField, z: number) => {
  const m = field.meander(z);
  return { a: { x: m - 110, z }, b: { x: m + 110, z } };
};

/** Each stretch of plain road between its points: its rise over run, and the steepest ground it lies on. */
function plainSegments(field: WorldField, road: Road): Array<{ grade: number; slope: number; x: number; z: number }> {
  const out: Array<{ grade: number; slope: number; x: number; z: number }> = [];
  for (let i = 0; i + 1 < road.points.length; i++) {
    if (road.bridges[i]) continue;
    const a = road.points[i], b = road.points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out.push({ grade: Math.abs(field.heightAt(b.x, b.z) - field.heightAt(a.x, a.z)) / len, slope: field.slopeAt((a.x + b.x) / 2, (a.z + b.z) / 2), x: a.x, z: a.z });
  }
  return out;
}

describe('a road across a canyon', () => {
  it.each(SEEDS)('seed %i: spans from rim to rim instead of going down into it', (seed) => {
    const field = createField(canyon(seed));
    for (const z of [-200, -60, 90, 220]) {
      const { a, b } = rims(field, z);
      const road = findRoad(field, a, b);
      expect(road, `a road at z=${z}`).not.toBeNull();
      expect(road!.bridges.some(Boolean), `a bridge at z=${z}`).toBe(true);
      const rim = Math.min(field.heightAt(a.x, a.z), field.heightAt(b.x, b.z));
      const low = Math.min(...road!.points.map((p) => field.heightAt(p.x, p.z)));
      expect(low, `the road stays up at z=${z}`).toBeGreaterThan(rim - 12);
    }
  });

  it.each(SEEDS)('seed %i: the deck stands clear of the ground all along, and each end is on level ground', (seed) => {
    const field = createField(canyon(seed));
    for (const z of [-200, -60, 90, 220]) {
      const { a, b } = rims(field, z);
      const road = findRoad(field, a, b)!;
      const { yAt } = drawnRoad(field, road);
      road.bridges.forEach((on, i) => {
        if (!on) return;
        const a = road.points[i], b = road.points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
        // Off the drawn points the height is the ground's: measure the deck through the span's own points.
        const { points, bridge } = drawnRoad(field, road);
        const onThisSpan = points.filter((p, k) => bridge[k] && bridge[k - 1] && Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(p.x - b.x, p.z - b.z) < len + 0.01);
        for (const p of onThisSpan) {
          const fromEnd = Math.min(Math.hypot(p.x - a.x, p.z - a.z), Math.hypot(p.x - b.x, p.z - b.z));
          expect(yAt(p.x, p.z), `deck at ${p.x},${p.z}`).toBeGreaterThan(field.heightAt(p.x, p.z) + (fromEnd > 16 ? 1 : 0));
        }
        for (const p of [a, b]) expect(field.slopeAt(p.x, p.z), `abutment at ${p.x},${p.z}`).toBeLessThan(CLIFF);
        expect(Math.hypot(road.points[i + 1].x - road.points[i].x, road.points[i + 1].z - road.points[i].z)).toBeLessThanOrEqual(MAX_SPAN);
      });
    }
  });

  it('works the same with no river in the canyon', () => {
    const field = createField(canyon(9137, false));
    const { a, b } = rims(field, 40);
    const road = findRoad(field, a, b)!;
    expect(road.bridges.some(Boolean)).toBe(true);
  });

  it('runs the same way every time', () => {
    const { a, b } = rims(createField(canyon(9137)), 40);
    expect(findRoad(createField(canyon(9137)), a, b)).toEqual(findRoad(createField(canyon(9137)), a, b));
  });
});

describe('no road goes down a cliff', () => {
  it.each(SEEDS)('seed %i: a whole canyon world', (seed) => {
    const w = buildWorld(canyon(seed));
    for (const road of w.roads) {
      if (road.width !== 4) continue; // a place's own streets are laid out by its layout, not routed
      const walls = plainSegments(w.field, road).filter((s) => s.grade > WALL);
      expect(walls, `${road.points.length} points`).toEqual([]);
    }
  });

  it.each(SEEDS)('seed %i: a city on the rim stops its streets at the edge', (seed) => {
    const r = canyon(seed);
    const m = createField(r).meander(40);
    const w = buildWorld({ ...r, paths: [], places: [
      { id: 'city', kind: 'settlement', label: 'Red city', asset: 'modern apartment block', size: 'large', interaction: 'none', where: [{ rel: 'at', x: m - 175, z: 40 }], layout: { pattern: 'grid', count: 16, height: 'tall' } },
      { id: 'tower', kind: 'landmark', label: 'Far rim tower', asset: 'glass skyscraper', size: 'medium', interaction: 'none', where: [{ rel: 'at', x: m + 170, z: 70 }] },
    ] });
    for (const road of w.roads) {
      if (road.width === 4) continue; // routed roads may start on a steep end: above
      for (let i = 0; i + 1 < road.points.length; i++) {
        const a = road.points[i], b = road.points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
        for (let k = 0; k < n; k++) {
          const x0 = a.x + ((b.x - a.x) * k) / n, z0 = a.z + ((b.z - a.z) * k) / n, x1 = a.x + ((b.x - a.x) * (k + 1)) / n, z1 = a.z + ((b.z - a.z) * (k + 1)) / n;
          const grade = Math.abs(w.field.heightAt(x1, z1) - w.field.heightAt(x0, z0)) / Math.hypot(x1 - x0, z1 - z0);
          expect(grade, `street at ${x0.toFixed(0)},${z0.toFixed(0)}`).toBeLessThanOrEqual(CLIFF);
        }
      }
    }
  });

  it('a place on the canyon floor gets no road down a sheer wall', () => {
    const field = createField(canyon(9137));
    const m = field.meander(40);
    expect(findRoad(field, { x: m - 110, z: 40 }, { x: m + 18, z: 40 })).toBeNull();
  });

  it('two places on the floor are still joined along it', () => {
    const field = createField(canyon(9137, false));
    const road = findRoad(field, { x: field.meander(-60), z: -60 }, { x: field.meander(60), z: 60 })!;
    expect(road).not.toBeNull();
    expect(road.bridges.some(Boolean)).toBe(false);
  });

  it.each([2210, 11, 77, 4242, 500, 901])('seed %i: a mountain world still reaches its places, up steep ground if it must', (seed) => {
    const r = loadRecipeFixture('snowy-mountains');
    const w = buildWorld({ ...r, seed });
    expect(w.log.filter((l) => l.startsWith('No road'))).toEqual([]);
  });

  it('a river between low banks keeps a low bridge of its own width', () => {
    const w = buildWorld(loadRecipeFixture('fishing-valley'));
    const spans = w.roads.flatMap((r) => r.bridges.flatMap((on, i) => (on ? [{ high: r.high?.[i] ?? false, len: Math.hypot(r.points[i + 1].x - r.points[i].x, r.points[i + 1].z - r.points[i].z) }] : [])));
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) {
      expect(s.high).toBe(false);
      expect(s.len).toBeLessThan(45);
    }
  });

  it('a shallow dip stays a road', () => {
    const r = loadRecipeFixture('fishing-valley');
    const w = buildWorld({ ...r, terrain: { ...r.terrain, shape: 'plains' }, water: { ...r.water, river: false, lake: false } });
    for (const road of w.roads) expect(road.high ?? []).not.toContain(true);
  });
});
