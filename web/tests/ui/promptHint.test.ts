import { describe, expect, it } from 'vitest';
import { HINT_LEAD, promptHint } from '../../src/ui/promptHint';

describe('promptHint', () => {
  it('opens on the plain invitation', () => {
    expect(promptHint(0)).toBe(HINT_LEAD);
  });

  it('types an idea out after the invitation, a little at a time', () => {
    const early = promptHint(200), later = promptHint(800);
    expect(early.startsWith(HINT_LEAD)).toBe(true);
    expect(later.startsWith(early)).toBe(true);
    expect(later.length).toBeGreaterThan(early.length);
  });

  it('always keeps the invitation, and moves through more than one idea', () => {
    const seen = new Set<string>();
    for (let ms = 0; ms < 120_000; ms += 50) {
      const hint = promptHint(ms);
      expect(hint.startsWith(HINT_LEAD)).toBe(true);
      seen.add(hint);
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  it('keeps going for as long as the page stays open', () => {
    expect(promptHint(1e9).startsWith(HINT_LEAD)).toBe(true);
  });
});
