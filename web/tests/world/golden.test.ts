import { describe, expect, it } from 'vitest';
import { buildWorld } from '../../src/world/build';
import { computeChunk } from '../../src/world/chunkData';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

/** FNV-1a over the bytes of every array and the scatter list: one number for what a chunk draws. */
function hashChunk(c: ReturnType<typeof computeChunk>): string {
  let h = 0x811c9dc5;
  const eat = (bytes: Uint8Array) => { for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } };
  for (const a of [c.positions, c.normals, c.colors, c.indices, c.grass]) eat(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  eat(new TextEncoder().encode(JSON.stringify(c.scatter)));
  return h.toString(16);
}

/**
 * What every fixture world draws, recorded before recipe `flora` existed. A world without flora must stay exactly this:
 * if one changes, a refactor moved something it should not have.
 */
const GOLDEN: Record<(typeof RECIPE_FIXTURES)[number], string[]> = {
  'fishing-valley': ['3f7d3f58', '6841d8ba', '68d3ee1b', 'a79fc13e', '26bd38e2'],
  'desert-canyon': ['1cada427', 'ad1dff54', 'de836c8d', '32525bf7', '906f949e'],
  'snowy-mountains': ['59adb78b', '196f5c67', '58dfbea7', '894de35d', 'a75869d0'],
  'tropical-island': ['ea6f4f3f', 'd0ccd680', 'c8eba390', '8cc46028', 'd6ad2b5a'],
};

describe('golden: worlds without flora are unchanged', () => {
  it.each(RECIPE_FIXTURES)('%s draws the recorded chunks', (name) => {
    const field = buildWorld(loadRecipeFixture(name)).field;
    const hashes: string[] = [];
    for (const [cx, cz] of [[-3, -3], [0, 0], [2, -1], [-1, 2], [3, 3]]) hashes.push(hashChunk(computeChunk(field, cx, cz)));
    expect(hashes).toEqual(GOLDEN[name]);
  });
});
