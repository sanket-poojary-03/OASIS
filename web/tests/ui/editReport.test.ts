import { describe, expect, it } from 'vitest';
import { applyOps, type Op } from '../../src/core/ops';
import type { Placement } from '../../src/world/placement';
import { reportEdit } from '../../src/ui/editReport';
import { loadRecipeFixture } from '../fixtures';

// Facing north (-z) from the origin: ahead is -z, right is +x.
const player = { x: 0, z: 0, yaw: 0 };
const placement = (id: string, x: number, z: number, reasons: string[] = ['placed where you asked']) =>
  ({ id, kind: 'prop', x, z, y: 0, rotation: 0, radius: 2, reasons, warnings: [], padded: false }) as Placement;

function report(ops: Op[], placements: Placement[], spots: Record<number, Array<{ x: number; z: number }>> = {}) {
  const before = loadRecipeFixture('fishing-valley');
  const after = applyOps(before, ops).recipe;
  return reportEdit({ ops, before, after, placements, lifeSpots: (i) => spots[i] ?? [], player });
}

describe('reportEdit', () => {
  it('names any placed object by its label, with how far and which way to look', () => {
    const ops: Op[] = [{ op: 'addPlace', place: { id: 'statue', kind: 'prop', label: 'Crystal Statue', asset: 'crystal statue', size: 'small', interaction: 'none', where: [{ rel: 'at', x: 0, z: -37 }] } }];
    expect(report(ops, [placement('statue', 0, -37)])).toBe('Added Crystal Statue, 37 m ahead');
  });

  it('keeps the solver\'s "why here" for a place it chose itself', () => {
    const ops: Op[] = [{ op: 'addPlace', place: { id: 'tower2', kind: 'landmark', label: 'Watchtower', asset: 'watchtower', size: 'medium', interaction: 'none', where: [{ rel: 'highest' }] } }];
    expect(report(ops, [placement('tower2', 120, 0, ['on high ground'])])).toBe('Added Watchtower, 120 m to your right (on high ground)');
  });

  it('reports an animal by what it is, how many and where, whatever animal it is', () => {
    const before = loadRecipeFixture('fishing-valley');
    const i = before.life.length;
    expect(report([{ op: 'addLife', kind: 'animal', asset: 'dragon', count: 1, at: { x: 0, z: 37 } }], [], { [i]: [{ x: 0, z: 37 }] }))
      .toBe('Added dragon, 37 m behind you');
    expect(report([{ op: 'addLife', kind: 'animal', asset: 'sheep', count: 3 }], [], { [i]: [{ x: -20, z: 0 }, { x: -22, z: 0 }, { x: -21, z: 1 }] }))
      .toBe('Added 3 sheep, 21 m to your left');
    expect(report([{ op: 'addLife', kind: 'deer', count: 2 }], [], { [i]: [{ x: 1, z: 1 }, { x: 2, z: 2 }] }))
      .toBe('Added 2 deer, right here');
  });

  it('says so when an animal found no room, instead of a bare "Done"', () => {
    expect(report([{ op: 'addLife', kind: 'animal', asset: 'whale', count: 1 }], [])).toBe('No room for whale anywhere near');
  });

  it('covers several changes at once, moves, changes and removals too', () => {
    const before = loadRecipeFixture('fishing-valley');
    const [a, b] = before.places;
    const ops: Op[] = [
      { op: 'movePlace', id: a.id, where: [{ rel: 'at', x: 0, z: -50 }] },
      { op: 'removePlace', id: b.id },
    ];
    expect(report(ops, [placement(a.id, 0, -50)])).toBe(`Moved ${a.label}, 50 m ahead · Removed ${b.label}`);
  });

  it('has nothing to say for changes that place nothing (the caller says "Done")', () => {
    expect(report([{ op: 'setNature', trees: 2 }], [])).toBeNull();
  });
});
