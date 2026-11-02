import { describe, expect, it } from 'vitest';
import { makeEditContext } from '../../src/api/editContext';
import { localEdit } from '../../src/api/localMock';
import { loadRecipeFixture } from '../fixtures';

const recipe = loadRecipeFixture('fishing-valley');
const [first, second] = recipe.places;
// Placement-like objects carry extra fields (reasons, y, radius...) that must never reach the strict backend model.
const placements = [
  { id: first.id, x: 10.4, z: -20.6, y: 3, radius: 9, reasons: ['flat ground'], warnings: [] },
  { id: second.id, x: -100.5, z: 7.49, y: 1, radius: 4, reasons: [], warnings: [] },
];

describe('makeEditContext (strict /api/edit context)', () => {
  it('sends only player, lookAt, lookingAt and placements; placements are {id,label,x,z}', () => {
    const ctx = makeEditContext({ player: { x: 1.5, z: -2 }, recipe, placements, hit: { x: 12.34, y: 4.567, z: -8.06, placeId: first.id } });
    expect(Object.keys(ctx).sort()).toEqual(['lookAt', 'lookingAt', 'placements', 'player']);
    expect(ctx.player).toEqual({ x: 1.5, z: -2 });
    expect(ctx.lookAt).toEqual({ x: 12.3, z: -8.1, y: 4.57 });
    expect(ctx.lookingAt).toBe(first.id);
    expect(ctx.placements).toEqual([
      { id: first.id, label: first.label, x: 10, z: -21 },
      { id: second.id, label: second.label, x: -100, z: 7 },
    ]);
    for (const p of ctx.placements) expect(Object.keys(p).sort()).toEqual(['id', 'label', 'x', 'z']);
  });

  it('omits lookAt and lookingAt (never null) when the crosshair hits nothing', () => {
    const ctx = makeEditContext({ player: { x: 0, z: 0 }, recipe, placements, hit: null });
    expect(Object.keys(ctx).sort()).toEqual(['placements', 'player']);
    expect(JSON.stringify(ctx)).not.toContain('null');
  });

  it('terrain hit: lookAt with y, no lookingAt', () => {
    const ctx = makeEditContext({ player: { x: 0, z: 0 }, recipe, placements, hit: { x: 3, y: 1.234, z: 4 } });
    expect(ctx.lookAt).toEqual({ x: 3, z: 4, y: 1.23 });
    expect('lookingAt' in ctx).toBe(false);
    expect(JSON.stringify(ctx)).not.toContain('null');
  });

  it('a look override (director) gives lookAt without y and ignores any hit', () => {
    const ctx = makeEditContext({ player: { x: 0, z: 0 }, recipe, placements, override: { x: 40.06, z: -3 }, hit: { x: 1, y: 2, z: 3, placeId: first.id } });
    expect(ctx.lookAt).toEqual({ x: 40.1, z: -3 });
    expect('lookingAt' in ctx).toBe(false);
  });

  it('clamps lookAt to the core map (the `at` relation range)', () => {
    const ctx = makeEditContext({ player: { x: 900, z: 900 }, recipe, placements: [], hit: { x: 900, y: 0, z: -731 } });
    expect(ctx.lookAt).toEqual({ x: 512, z: -512, y: 0 });
    expect(ctx.player).toEqual({ x: 900, z: 900 });
  });

  it('the offline mock accepts it: "put a lantern here" lands at the crosshair', () => {
    const ctx = makeEditContext({ player: { x: 0, z: 0 }, recipe, placements, hit: { x: 12.34, y: 4.5, z: -8.06 } });
    const res = localEdit(recipe, 'put a lantern here', ctx);
    expect(res).toMatchObject({ type: 'ops', ops: [{ op: 'addPlace', place: { where: [{ rel: 'at', x: 12.3, z: -8.1 }] } }] });
  });
});
