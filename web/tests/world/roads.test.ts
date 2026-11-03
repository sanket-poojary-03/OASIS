import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { chaikin, findPath, roadNetwork } from '../../src/world/roads';
import { loadRecipeFixture } from '../fixtures';

describe('roads', () => {
  it('chaikin keeps endpoints and adds points', () => {
    const out = chaikin([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], 2);
    expect(out[0]).toEqual({ x: 0, z: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, z: 10 });
    expect(out.length).toBeGreaterThan(3);
  });

  it('connects two placements on the valley', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pls = solvePlacements(r, field);
    const v = pls.find((p) => p.id === 'village')!, t = pls.find((p) => p.id === 'tower')!;
    const road = findPath(field, v, t);
    expect(road).not.toBeNull();
    const pts = road!.points;
    expect(Math.hypot(pts[0].x - v.x, pts[0].z - v.z)).toBeLessThan(12);
    expect(Math.hypot(pts[pts.length - 1].x - t.x, pts[pts.length - 1].z - t.z)).toBeLessThan(12);
    expect(road!.bridges.length).toBe(pts.length - 1);
    expect(road!.width).toBe(4);
  });
});

describe('roadNetwork', () => {
  const nodes = [
    { id: 'a', x: 0, z: 0 }, { id: 'b', x: 100, z: 0 }, { id: 'c', x: 100, z: 100 }, { id: 'd', x: -300, z: 0 }, { id: 'e', x: 110, z: 10 },
  ];
  it('connects every place with the shortest set of roads (a spanning tree)', () => {
    const edges = roadNetwork(nodes);
    expect(edges).toHaveLength(nodes.length - 1);
    const linked = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const [x, y] of edges) {
      const merged = new Set([...linked.get(x)!, ...linked.get(y)!]);
      for (const id of merged) linked.set(id, merged);
    }
    expect(linked.get('a')!.size).toBe(nodes.length); // all in one network
    expect(edges.some(([x, y]) => [x, y].sort().join() === 'b,e')).toBe(true); // near neighbours, not a star
    expect(edges.some(([x, y]) => [x, y].sort().join() === 'a,d')).toBe(true); // the far one joins at its nearest
  });
  it('adds the AI paths it does not already have, never duplicates or self-loops', () => {
    const edges = roadNetwork(nodes, [['a', 'c'], ['e', 'b'], ['a', 'a'], ['a', 'zzz']]);
    expect(edges).toHaveLength(nodes.length); // the tree plus a→c only
    expect(edges.at(-1)).toEqual(['a', 'c']);
  });
  it('is deterministic and handles tiny worlds', () => {
    expect(roadNetwork(nodes)).toEqual(roadNetwork(nodes));
    expect(roadNetwork([nodes[0]])).toEqual([]);
    expect(roadNetwork([])).toEqual([]);
  });
});
