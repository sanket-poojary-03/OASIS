import { describe, expect, it } from 'vitest';
import { needsRecovery, pickNearestLit } from '../../src/logic/lightMath';

describe('pickNearestLit', () => {
  const pts = [
    { x: 10, y: 0, z: 0, lit: true },
    { x: 1, y: 0, z: 0, lit: false },
    { x: 3, y: 0, z: 0, lit: true },
    { x: 20, y: 0, z: 0, lit: true },
  ];
  it('skips unlit and orders nearest first', () => expect(pickNearestLit(pts, 0, 0, 0, 5)).toEqual([2, 0, 3]));
  it('limits to k', () => expect(pickNearestLit(pts, 0, 0, 0, 2)).toEqual([2, 0]));
  it('handles empty', () => expect(pickNearestLit([], 0, 0, 0, 3)).toEqual([]));
});

describe('needsRecovery', () => {
  it('is false near the ground', () => expect(needsRecovery(5, 5.5)).toBe(false));
  it('is true well below the ground', () => expect(needsRecovery(1, 5)).toBe(true));
});
