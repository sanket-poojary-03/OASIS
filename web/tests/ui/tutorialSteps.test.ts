import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS } from '../../src/ui/tutorialSteps';

const taught = new Set(TUTORIAL_STEPS.flatMap((s) => s.keys));

describe('the tutorial', () => {
  it('teaches every key the game answers to, so a new key cannot be forgotten', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    const bound = [...main.matchAll(/e\.code === 'Key([A-Z])'/g)].map((m) => m[1]);
    expect(bound.length).toBeGreaterThan(5);
    for (const key of bound) expect(taught, `key ${key}`).toContain(key);
  });

  it('teaches moving, running, jumping and the booster keys', () => {
    for (const key of ['W', 'A', 'S', 'D', 'Shift', 'Space', 'Mouse']) expect(taught).toContain(key);
  });

  it('says what each key really does', () => {
    const about = (key: string) => TUTORIAL_STEPS.filter((s) => s.keys.includes(key)).map((s) => `${s.title} ${s.text}`).join(' ');
    expect(about('B')).toMatch(/character/i);
    expect(about('C')).toMatch(/check/i);
    expect(about('C')).not.toMatch(/character/i);
    expect(about('E')).toMatch(/drive/i);
    expect(about('E')).not.toMatch(/spawn/i);
  });

  it('gives each step one short idea, so it can be read at a glance', () => {
    for (const s of TUTORIAL_STEPS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.title.length).toBeLessThanOrEqual(30);
      expect(s.text.length).toBeLessThanOrEqual(140);
    }
  });
});
