import { describe, expect, it } from 'vitest';
import { waitUntil } from '../../src/ui/wait';

/** A fake frame loop: each frame advances the clock by `step` ms and runs `onFrame`. */
function frames(step: number, onFrame: (n: number) => void = () => {}) {
  const clock = { t: 0, n: 0 };
  return { clock, now: () => clock.t, frame: async () => { clock.t += step; onFrame(++clock.n); } };
}

describe('waitUntil', () => {
  it('resolves true as soon as the condition holds', async () => {
    let ready = false;
    const f = frames(16, (n) => { if (n === 5) ready = true; });
    expect(await waitUntil(() => ready, { timeoutMs: 20_000, frame: f.frame, now: f.now })).toBe(true);
    expect(f.clock.n).toBe(5);
  });

  it('gives up after the timeout', async () => {
    const f = frames(16);
    expect(await waitUntil(() => false, { timeoutMs: 1000, frame: f.frame, now: f.now })).toBe(false);
    expect(f.clock.t).toBeGreaterThanOrEqual(1000);
    expect(f.clock.t).toBeLessThan(1100);
  });

  it('fails fast when failed() reports the wait can never finish', async () => {
    let dead = false;
    const f = frames(16, (n) => { if (n === 3) dead = true; });
    expect(await waitUntil(() => false, { failed: () => dead, timeoutMs: 20_000, frame: f.frame, now: f.now })).toBe(false);
    expect(f.clock.n).toBe(3);
  });

  it('a long gap between frames (hidden tab) counts at most maxStepMs', async () => {
    let ready = false;
    const f = frames(60_000, (n) => { if (n === 10) ready = true; }); // every frame is a minute apart
    expect(await waitUntil(() => ready, { timeoutMs: 20_000, frame: f.frame, now: f.now, maxStepMs: 100 })).toBe(true);
  });
});
