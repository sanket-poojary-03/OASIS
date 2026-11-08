import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Avatar } from '../../src/player/avatar';
import { CHARACTERS, CharacterRoster } from '../../src/player/characters';
import { fakeTemplate } from '../render/rigFixture';

const gltf = () => { const t = fakeTemplate(1); return { scene: t.scene, animations: t.animations }; };

describe('CharacterRoster', () => {
  it('wears the first bundled character, then B cycles through all of them and back', async () => {
    const avatar = new Avatar(new THREE.Scene());
    const load = vi.fn(async () => gltf());
    const roster = new CharacterRoster(avatar, load, '/');
    expect(await roster.start()).toBe(true);
    expect(avatar.hasModel).toBe(true);
    expect(load).toHaveBeenLastCalledWith('/models/characters/street.glb');
    const names = [];
    for (let i = 0; i < CHARACTERS.length; i++) names.push(await roster.next());
    expect(names).toEqual(['Tourist', 'Builder', 'Police', 'Woman', 'Street']);
    expect(load).toHaveBeenCalledTimes(5); // each file once, then reused
  });

  it('a character that fails to load leaves the current one on', async () => {
    const avatar = new Avatar(new THREE.Scene());
    const use = vi.spyOn(avatar, 'use');
    const roster = new CharacterRoster(avatar, async (url) => { if (url.includes('tourist')) throw new Error('404'); return gltf(); }, '/');
    await roster.start();
    vi.spyOn(console, 'warn').mockImplementationOnce(() => {});
    expect(await roster.next()).toMatch(/Tourist could not be loaded/);
    expect(roster.current).toBe('Street');
    expect(use).toHaveBeenCalledTimes(1);
  });
});
