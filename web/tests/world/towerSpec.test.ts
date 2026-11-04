import { describe, expect, it } from 'vitest';
import { towerFacade, towerSpec } from '../../src/world/towerSpec';

describe('towerFacade', () => {
  it('codes generic modern buildings and leaves named or old-world ones to the model finder', () => {
    expect(towerFacade('glass skyscraper', true, true)).toBe('glass');
    expect(towerFacade('apartment block', true, false)).toBe('apartment');
    expect(towerFacade('office building', true, true)).toBe('office');
    expect(towerFacade('tower', true, true)).toBe('mixed'); // a city grid's "tower"
    expect(towerFacade('tower', true, false)).toBeNull(); // a ring of "towers" may be anything
    expect(towerFacade('watchtower', true, true)).toBeNull();
    expect(towerFacade('stone tower', true, true)).toBeNull();
    expect(towerFacade('bell tower', false, false)).toBeNull();
    expect(towerFacade('bakery', true, true)).toBeNull();
    expect(towerFacade('cyberpunk tower', true, true)).toBeNull();
    expect(towerFacade('office', false, false)).toBeNull(); // a single office: a model
    expect(towerFacade('a tall glass skyscraper', false, false)).toBe('glass');
  });
});

describe('towerSpec', () => {
  it('is the same for the same seed and fits its height and plot', () => {
    expect(towerSpec(42, 'mixed', 50, 11)).toEqual(towerSpec(42, 'mixed', 50, 11));
    for (let s = 0; s < 60; s++) {
      const t = towerSpec(s * 7919, 'mixed', 20 + (s % 5) * 10, 11);
      const top = t.tiers[t.tiers.length - 1];
      expect(Math.abs(top.y + top.h - (20 + (s % 5) * 10))).toBeLessThanOrEqual(t.floor / 2 + 1e-9);
      for (const tier of t.tiers) { expect(tier.w).toBeLessThanOrEqual(11); expect(tier.d).toBeLessThanOrEqual(11); }
      for (let i = 1; i < t.tiers.length; i++) {
        expect(t.tiers[i].w).toBeLessThan(t.tiers[i - 1].w); // setbacks step in
        expect(t.tiers[i].y).toBeCloseTo(t.tiers[i - 1].y + t.tiers[i - 1].h);
      }
    }
  });

  it('gives a downtown many different buildings', () => {
    const specs = Array.from({ length: 48 }, (_, i) => towerSpec(1000 + i * 31, 'mixed', 30 + (i % 4) * 8, 11));
    expect(new Set(specs.map((s) => s.facade)).size).toBe(3);
    expect(new Set(specs.map((s) => s.body)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(specs.map((s) => s.tiers.length)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(specs.map((s) => s.roof)).size).toBeGreaterThanOrEqual(3);
  });
});
