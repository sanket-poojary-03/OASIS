import { describe, expect, it } from 'vitest';
import { placeholderKind } from '../../src/render/placeholders';

describe('placeholderKind', () => {
  it.each([
    ['white stone lighthouse', 'lighthouse'],
    ['stone castle with towers', 'castle'],
    ['ruined stone watchtower', 'tower'],
    ['wooden fishing cottage', 'house'],
    ['thatched beach hut', 'house'],
    ['wooden log cabin', 'house'],
    ['campfire with stones', 'campfire'],
    ['bronze bell on wooden post', 'bell'],
    ['iron lantern on post', 'lantern'],
    ['desert tent', 'tent'],
    ['weathered stone obelisk', 'obelisk'],
    ['stone well', 'well'],
    ['market stall', 'stall'],
    ['wooden barrel', 'barrel'],
    ['something unusual', 'generic'],
  ])('%s → %s', (asset, kind) => {
    expect(placeholderKind(asset)).toBe(kind);
  });
});
