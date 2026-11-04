import { describe, expect, it } from 'vitest';
import { RenderScale } from '../../src/render/renderScale';

const run = (s: RenderScale, fps: number, seconds: number) => { for (let t = 0; t < seconds; t += 1 / fps) s.sample(1 / fps); };
/** A fill-bound GPU: each 0.1 off the scale buys 8 fps. */
const fill = (s: RenderScale, fullFps: number, seconds: number) => { for (let t = 0; t < seconds;) { const fps = fullFps + (1 - s.ratio) * 80; s.sample(1 / fps); t += 1 / fps; } };

describe('RenderScale', () => {
  it('steps resolution down while slow, never below its floor', () => {
    const applied: number[] = [];
    const s = new RenderScale(1, (r) => applied.push(r));
    fill(s, 20, 2.1);
    expect(s.ratio).toBe(0.9);
    fill(s, 20, 30);
    expect(s.ratio).toBe(0.6);
    expect(applied[0]).toBe(0.9);
  });

  it('climbs back only after three fast windows, and never above its maximum', () => {
    const s = new RenderScale(1, () => {});
    fill(s, 30, 4.1);
    expect(s.ratio).toBe(0.8);
    run(s, 60, 4.1);
    expect(s.ratio).toBe(0.8); // two fast windows: not yet
    run(s, 60, 2.1);
    expect(s.ratio).toBe(0.85);
    run(s, 60, 60);
    expect(s.ratio).toBe(1);
  });

  it('undoes a step that did not help (not fill-bound) and holds', () => {
    const s = new RenderScale(1, () => {});
    run(s, 36, 2.1);
    expect(s.ratio).toBe(0.9);
    run(s, 37, 2.1); // one fps better: not the pixels
    expect(s.ratio).toBe(1);
    run(s, 36, 18);
    expect(s.ratio).toBe(1); // holding
  });

  it('holds steady in between, and ignores hitches', () => {
    const s = new RenderScale(1, () => {});
    run(s, 50, 30);
    expect(s.ratio).toBe(1);
    s.sample(3); // a hidden tab
    expect(s.ratio).toBe(1);
  });
});
