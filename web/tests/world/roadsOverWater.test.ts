import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/core/recipe';
import { buildWorld, type BuiltWorld } from '../../src/world/build';
import type { Road, WorldField } from '../../src/world/field';
import { createField } from '../../src/world/field';
import { findRoad, longestBridge, MAX_BRIDGE, roadNetwork } from '../../src/world/roads';
import { loadRecipeFixture } from '../fixtures';

const FIXTURES = ['snowy-mountains', 'fishing-valley', 'desert-canyon', 'tropical-island'] as const;

function worlds(): Array<readonly [string, BuiltWorld]> {
  const out: Array<readonly [string, BuiltWorld]> = [];
  for (const f of FIXTURES) for (const [shape, seaLevel] of [['valley', 0], ['hills', 0], ['plains', 0.3]] as const) {
    const r = loadRecipeFixture(f);
    const recipe: Recipe = { ...r, terrain: { ...r.terrain, shape, seaLevel }, water: { ...r.water, river: true, lake: true } };
    out.push([`${f}/${shape}/sea ${seaLevel}`, buildWorld(recipe)]);
  }
  return out;
}
const WORLDS = worlds();

/** Every stretch of plain road, sampled across its width. */
function plainRoadOverWater(field: WorldField, road: Road): string[] {
  const wet: string[] = [];
  for (let i = 0; i + 1 < road.points.length; i++) {
    if (road.bridges[i]) continue;
    const a = road.points[i], b = road.points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (let t = 0; t <= len; t += 2) for (const s of [-1, 0, 1]) {
      const x = a.x + ((b.x - a.x) * t) / len + nx * s * (road.width / 2), z = a.z + ((b.z - a.z) * t) / len + nz * s * (road.width / 2);
      if (field.isWater(x, z)) wet.push(`${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
  return wet;
}

describe('a road and water', () => {
  it.each(WORLDS)('%s: no plain road lies on water, not even its edge', (_, w) => {
    const wet = w.roads.flatMap((r) => plainRoadOverWater(w.field, r));
    expect(wet).toEqual([]);
  });

  it.each(WORLDS)('%s: every crossing is one straight span from bank to bank', (_, w) => {
    for (const road of w.roads) for (let i = 0; i < road.bridges.length; i++) {
      if (!road.bridges[i]) continue;
      expect(road.bridges[i - 1] ?? false, 'a span is a single segment').toBe(false);
      const a = road.points[i], b = road.points[i + 1];
      expect(w.field.isWater(a.x, a.z), `bank at ${a.x},${a.z}`).toBe(false);
      expect(w.field.isWater(b.x, b.z), `bank at ${b.x},${b.z}`).toBe(false);
    }
  });

  it.each(WORLDS)('%s: no span is longer than a bridge may be', (_, w) => {
    for (const road of w.roads) expect(longestBridge(road)).toBeLessThanOrEqual(MAX_BRIDGE);
  });

  it('crosses a river square on: about its width, not along it', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    for (const i of [30, 60, 90]) {
      const r = field.river[i];
      const road = findRoad(field, { x: r.x - 70, z: r.z - 40 }, { x: r.x + 70, z: r.z + 40 })!;
      expect(road.bridges.some(Boolean)).toBe(true);
      expect(longestBridge(road)).toBeLessThan(40); // the channel is 32 wide; a slant across it took up to 56
    }
  });

  it('keeps back from the bank when it runs beside a river', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    const r = field.river[60];
    const road = findRoad(field, { x: r.x + 40, z: r.z - 120 }, { x: r.x + 40, z: r.z + 120 })!;
    expect(road.bridges.some(Boolean)).toBe(false);
    let near = 0;
    for (const p of road.points) if (field.riverDistance(p.x, p.z, 48) < 22) near++;
    expect(near).toBe(0);
  });

  it('goes round a lake when there is a way round', () => {
    const r = loadRecipeFixture('snowy-mountains');
    const field = createField({ ...r, water: { ...r.water, river: false, lake: true } });
    const l = field.lakes[0];
    const road = findRoad(field, { x: l.x - l.radius - 30, z: l.z }, { x: l.x + l.radius + 30, z: l.z })!;
    expect(road.bridges.some(Boolean)).toBe(false);
  });
});

describe('roadNetwork with a price', () => {
  // Two groups either side of x = 0, as if a river ran between them.
  const nodes = [
    { id: 'a', x: -30, z: 0 }, { id: 'b', x: 30, z: 5 }, { id: 'c', x: -30, z: 100 }, { id: 'd', x: 30, z: 105 }, { id: 'e', x: -30, z: 200 }, { id: 'f', x: 30, z: 205 },
  ];
  const across = (p: { x: number }, q: { x: number }) => (p.x < 0) !== (q.x < 0);
  const crossings = (edges: Array<[string, string]>) => edges.filter(([u, v]) => across(nodes.find((n) => n.id === u)!, nodes.find((n) => n.id === v)!)).length;

  it('crosses as often as distance alone says, with no price', () => {
    expect(crossings(roadNetwork(nodes))).toBeGreaterThan(1);
  });

  it('crosses once when a crossing costs more than the way round', () => {
    const edges = roadNetwork(nodes, [], (p, q) => Math.hypot(p.x - q.x, p.z - q.z) + (across(p, q) ? 1000 : 0));
    expect(edges).toHaveLength(nodes.length - 1);
    expect(crossings(edges)).toBe(1);
  });
});
