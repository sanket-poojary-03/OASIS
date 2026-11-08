import { describe, expect, it } from 'vitest';
import { BUSY_STAGES, busyWord } from '../../src/ui/busyWords';

describe('busyWord', () => {
  it('opens every stage on a plain word', () => {
    expect(busyWord('thinking', 0)).toBe('Thinking');
    expect(busyWord('designing', 0)).toBe('Designing');
    expect(busyWord('building', 0)).toBe('Building');
    expect(busyWord('editing', 0)).toBe('Thinking');
  });

  it('changes word as time passes', () => {
    for (const stage of BUSY_STAGES) expect(busyWord(stage, 1)).not.toBe(busyWord(stage, 0));
  });

  it('keeps cycling while the AI takes its time, without going back to the opening word', () => {
    const seen = Array.from({ length: 40 }, (_, i) => busyWord('thinking', i));
    expect(seen.slice(1)).not.toContain('Thinking');
    expect(new Set(seen.slice(20)).size).toBeGreaterThan(1);
  });

  it('settles on its last word while building, instead of starting over', () => {
    expect(busyWord('building', 50)).toBe(busyWord('building', 500));
    expect(busyWord('building', 50)).not.toBe('Building');
  });

  it('never names a thing a world may not have: any prompt must work', () => {
    for (const stage of BUSY_STAGES) for (let i = 0; i < 30; i++) expect(busyWord(stage, i)).not.toMatch(/village|river|forest|tree|city|hill|mountain/i);
  });
});
