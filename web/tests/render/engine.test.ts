import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Engine } from '../../src/render/engine';

afterEach(() => vi.restoreAllMocks());

/** An Engine without a WebGL context: only what tick() uses. */
function bareEngine(render: () => void): Engine {
  const e = Object.create(Engine.prototype) as Engine;
  Object.assign(e, { timer: new THREE.Timer(), updaters: [], postfx: { render } });
  return e;
}

describe('Engine frame (m2)', () => {
  it('keeps running when an updater or the render throws, and warns once per distinct error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rendered = 0, after = 0;
    const e = bareEngine(() => { rendered++; if (rendered > 1) throw new Error('lost context'); });
    e.onUpdate(() => { throw new Error('boom'); });
    e.onUpdate(() => { after++; });
    for (let i = 0; i < 5; i++) expect(() => e.tick()).not.toThrow();
    expect(after).toBe(5);
    expect(rendered).toBe(5);
    expect(warn).toHaveBeenCalledTimes(2); // 'boom' once, 'lost context' once
  });
});
