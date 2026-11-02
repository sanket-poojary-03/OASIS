import { describe, expect, it } from 'vitest';
import { KEYWORDS, localEdit, localWorld, pickFixture } from '../../src/api/localMock';
import type { EditContext } from '../../src/api/types';
import { applyOps, opsSchema } from '../../src/core/ops';
import { clampCore } from '../../src/core/recipe';
import { loadRecipeFixture } from '../fixtures';

const ctx = (patch: Partial<EditContext> = {}): EditContext => ({ player: { x: 0, z: 0 }, lookAt: null, lookingAt: null, placements: [], ...patch });
const r = loadRecipeFixture('fishing-valley');
const place = (prompt: string, c: EditContext) => {
  const res = localEdit(r, prompt, c);
  expect(res.type).toBe('ops');
  if (res.type !== 'ops') throw new Error('unreachable');
  expect(opsSchema.safeParse(res.ops).success).toBe(true);
  const op = res.ops[0];
  if (op.op !== 'addPlace') throw new Error('not addPlace');
  return op.place;
};

describe('localMock', () => {
  it('picks fixtures like the Python mock', () => {
    expect(pickFixture('a sandy desert canyon with an oasis')).toBe('desert-canyon');
    expect(pickFixture('frozen mountains with a castle')).toBe('snowy-mountains');
    expect(pickFixture('tropical island with a lighthouse')).toBe('tropical-island');
    expect(pickFixture('something else')).toBe('fishing-valley');
    const w = localWorld('island');
    expect(w.type === 'recipe' && w.recipe.terrain.shape).toBe('island');
  });

  it('keeps the keyword lists identical to backend/app/mock.py', () => {
    expect(Object.keys(KEYWORDS)).toEqual(['fishing-valley', 'desert-canyon', 'snowy-mountains', 'tropical-island']);
    expect(KEYWORDS['desert-canyon']).toHaveLength(13);
    expect(KEYWORDS['snowy-mountains'].slice(-2)).toEqual(['peak', 'peaks']);
  });

  it('exports clampCore from core/recipe', () => {
    expect(clampCore(12.44)).toBe(12.4);
    expect(clampCore(9999)).toBe(512);
    expect(clampCore(-9999)).toBe(-512);
  });

  // Parity with backend/tests/test_mock_edit.py
  it('understands time, weather and seasons', () => {
    const res = localEdit(r, 'make it night and rainy', ctx());
    expect(res.type === 'ops' && res.ops).toContainEqual({ op: 'setAtmosphere', time: 'night' });
    expect(res.type === 'ops' && res.ops).toContainEqual({ op: 'setAtmosphere', weather: 'rain' });
    const winter = localEdit(r, 'make it winter', ctx());
    expect(winter.type === 'ops' && winter.ops).toContainEqual({ op: 'setClimate', temperature: 0.1 });
    expect(winter.type === 'ops' && winter.ops).toContainEqual({ op: 'setAtmosphere', weather: 'snow' });
  });

  it('add here uses lookAt (rounded) and applies cleanly', () => {
    const res = localEdit(r, 'put a lantern here', ctx({ lookAt: { x: 12.4, z: -40 } }));
    const p = place('put a lantern here', ctx({ lookAt: { x: 12.4, z: -40 } }));
    expect(p.interaction).toBe('light');
    expect(p.kind).toBe('prop');
    expect(p.where).toEqual([{ rel: 'at', x: 12.4, z: -40 }]);
    expect(res.type === 'ops' && (() => applyOps(r, res.ops))).not.toThrow();
  });

  it('landmark without lookAt gets a flat constraint and a unique id', () => {
    const p = place('build a tower', ctx());
    expect(p.kind).toBe('landmark');
    expect(p.id).toBe('tower-2');
    expect(p.where).toEqual([{ rel: 'flat' }]);
    expect(place('put an apple tree here', ctx({ lookAt: { x: 1, z: 2 } })).asset).toBe('apple tree');
  });

  it('remove that, unknown text', () => {
    expect(localEdit(r, 'remove that', ctx({ lookingAt: 'campfire' }))).toMatchObject({ type: 'ops', ops: [{ op: 'removePlace', id: 'campfire' }] });
    expect(localEdit(r, 'tell me a joke', ctx()).type).toBe('unsupported');
  });

  it('bring a house near this -> near lookingAt + flat', () => {
    const p = place('bring a house near this', ctx({ lookAt: { x: 3, z: 4 }, lookingAt: 'campfire' }));
    expect(p.kind).toBe('structure');
    expect(p.interaction).toBe('door');
    expect(p.asset).toBe('house');
    expect(p.where).toEqual([{ rel: 'near', target: 'campfire', maxDist: 30 }, { rel: 'flat' }]);
  });

  it('candle on this table sets y and is a light', () => {
    const p = place('put a candle on this table', ctx({ lookAt: { x: 3, y: 0.95, z: 4 }, lookingAt: 'table' }));
    expect(p.interaction).toBe('light');
    expect(p.asset).toBe('candle');
    expect(p.where).toEqual([{ rel: 'at', x: 3, z: 4, y: 0.95 }]);
  });

  it('barrel here does not copy y', () => {
    const p = place('put a barrel here', ctx({ lookAt: { x: 3, y: 4.2, z: 4 }, lookingAt: 'wall' }));
    expect(p.where).toEqual([{ rel: 'at', x: 3, z: 4 }]);
  });

  it('extra mirror cases: near-this without target, lookingAt-only, atmosphere nouns', () => {
    expect(place('bring a bench near this', ctx({ lookAt: { x: 1, z: 2 } })).where).toEqual([{ rel: 'at', x: 1, z: 2 }]);
    expect(place('put a lamp', ctx({ lookingAt: 'campfire' })).where).toEqual([{ rel: 'near', target: 'campfire', maxDist: 30 }, { rel: 'flat' }]);
    expect(place('put a house on this hill', ctx({ lookAt: { x: 1, y: 9, z: 2 } })).where).toEqual([{ rel: 'at', x: 1, z: 2 }]);
    const night = localEdit(r, 'put night', ctx());
    expect(night.type === 'ops' && night.ops).toEqual([{ op: 'setAtmosphere', time: 'night' }]);
  });

  it.each(['put a lantern near this house', 'put a lantern next to that well', 'put a lantern by it', 'put a lantern near it in front of me'])('near-this allows a trailing noun: %s (m13)', (prompt) => {
    const p = place(prompt, ctx({ lookAt: { x: 3, z: 4 }, lookingAt: 'campfire' }));
    expect(p.asset).toBe('lantern');
    expect(p.interaction).toBe('light');
    expect(p.where).toEqual([{ rel: 'near', target: 'campfire', maxDist: 30 }, { rel: 'flat' }]);
  });

  it('the last demo step, "make it a clear day", sets day and clear weather', () => {
    const res = localEdit(r, 'make it a clear day', ctx());
    expect(res.type === 'ops' && res.ops).toEqual([{ op: 'setAtmosphere', time: 'day' }, { op: 'setAtmosphere', weather: 'clear' }]);
  });
});
