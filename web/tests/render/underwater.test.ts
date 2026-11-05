import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { underwaterLook } from '../../src/render/underwater';

const brightness = (c: THREE.Color) => c.r + c.g + c.b;

describe('underwaterLook', () => {
  it('closes in and darkens going down', () => {
    const shallow = underwaterLook(1, 0), deep = underwaterLook(40, 0);
    expect(deep.far).toBeLessThan(shallow.far);
    expect(brightness(deep.colour)).toBeLessThan(brightness(shallow.colour));
    expect(deep.veil).toBeGreaterThan(shallow.veil);
  });

  it('is darker at night', () => {
    expect(brightness(underwaterLook(1, 1).colour)).toBeLessThan(brightness(underwaterLook(1, 0).colour));
  });

  it('takes the world\'s own water colour: a purple sea is purple from inside', () => {
    const c = underwaterLook(0.1, 0, '#8022cc').colour;
    expect(c.b).toBeGreaterThan(c.g);
    expect(c.r).toBeGreaterThan(c.g);
  });

  it('stays visible: never closer than a swimmer can see', () => {
    expect(underwaterLook(500, 1).far).toBeGreaterThan(20);
  });
});
