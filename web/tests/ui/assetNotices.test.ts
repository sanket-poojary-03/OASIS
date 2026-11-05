import { describe, expect, it } from 'vitest';
import { MAX_WAITING, NoticeQueue } from '../../src/ui/assetNotices';

function queue() {
  const shown: string[] = [];
  const timers: Array<() => void> = [];
  const q = new NoticeQueue((t) => shown.push(t), (fn) => { timers.push(fn); });
  return { q, shown, tick: () => timers.shift()?.() };
}

describe('NoticeQueue', () => {
  it('shows the first at once and the next only after the gap, in order', () => {
    const { q, shown, tick } = queue();
    q.add('Meshy API key is missing');
    q.add('Building a robot manually');
    expect(shown).toEqual(['Meshy API key is missing']);
    tick();
    expect(shown).toEqual(['Meshy API key is missing', 'Building a robot manually']);
  });

  it('starts again at once after going idle', () => {
    const { q, shown, tick } = queue();
    q.add('a');
    tick();
    q.add('b');
    expect(shown).toEqual(['a', 'b']);
  });

  it('folds a long run into one line', () => {
    const { q, shown, tick } = queue();
    q.add('first');
    for (let i = 0; i < MAX_WAITING + 4; i++) q.add(`Building ${i} manually`);
    for (let i = 0; i < 10; i++) tick();
    expect(shown).toHaveLength(MAX_WAITING + 2);
    expect(shown[shown.length - 1]).toBe('4 more things are being built manually');
  });
});
