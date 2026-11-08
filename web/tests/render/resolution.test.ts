import { describe, expect, it, vi } from 'vitest';
import { RenderScale } from '../../src/render/renderScale';
import { applyResolution, loadResolution, pixelSize, ratioOf, saveResolution } from '../../src/render/resolution';

describe('resolution choices', () => {
  it('fixed choices have their own ratio, and Auto has none', () => {
    expect(ratioOf('auto', 1)).toBeNull();
    expect(ratioOf('low', 2)).toBe(0.5);
    expect(ratioOf('medium', 2)).toBe(0.75);
    expect(ratioOf('high', 2)).toBe(1);
  });

  it('Ultra is the screen\'s own sharpness, at least 1.5 and at most 2', () => {
    expect(ratioOf('ultra', 1)).toBe(1.5);
    expect(ratioOf('ultra', 1.75)).toBe(1.75);
    expect(ratioOf('ultra', 3)).toBe(2);
  });

  it('applying a choice holds it, and Auto lets go', () => {
    const s = new RenderScale(1, () => {});
    applyResolution(s, 'medium', 1);
    expect(s.ratio).toBe(0.75);
    for (let i = 0; i < 300; i++) s.sample(1 / 20);
    expect(s.ratio).toBe(0.75);
    applyResolution(s, 'auto', 1);
    expect(s.ratio).toBe(1);
    for (let i = 0; i < 60; i++) s.sample(1 / 20);
    expect(s.ratio).toBeLessThan(1);
  });

  it('remembers the choice', () => {
    const kept = new Map<string, string>();
    const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } };
    expect(loadResolution(storage)).toBe('auto');
    saveResolution(storage, 'high');
    expect(loadResolution(storage)).toBe('high');
  });

  it('falls back to Auto on a strange value, no storage, or storage that refuses', () => {
    expect(loadResolution({ getItem: () => 'huge' })).toBe('auto');
    expect(loadResolution(null)).toBe('auto');
    const refuses = { getItem: vi.fn(() => { throw new Error('denied'); }), setItem: vi.fn(() => { throw new Error('denied'); }) };
    expect(loadResolution(refuses)).toBe('auto');
    expect(() => saveResolution(refuses, 'low')).not.toThrow();
  });

  it('says what a ratio means in pixels on this window', () => {
    expect(pixelSize(0.75, 1920, 1080)).toBe('1440 × 810');
  });
});
