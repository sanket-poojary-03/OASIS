import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animatedClone, pickClip } from '../../src/render/animated';
import { fakeTemplate } from './rigFixture';

describe('animated models', () => {
  it('picks the shortest matching clip and never mistakes Death for eating', () => {
    const t = fakeTemplate(1);
    expect(pickClip(t.animations, 'idle')?.name).toBe('Idle');
    expect(pickClip(t.animations, 'run')?.name).toBe('Gallop');
    expect(pickClip(fakeTemplate(1, ['Death', 'Eating']).animations, 'idle')?.name).toBe('Eating');
    expect(pickClip(fakeTemplate(1, ['Death']).animations, 'idle')).toBeUndefined();
  });

  it('clones are independent, fitted to the template height with feet on y = 0', () => {
    const t = fakeTemplate(1.5);
    const a = animatedClone(t), b = animatedClone(t);
    expect(a.root).not.toBe(b.root);
    expect(a.mixer).not.toBe(b.mixer);
    a.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(a.root);
    expect(box.max.y - box.min.y).toBeCloseTo(1.5, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(t.scene.scale.x).toBe(1); // the template itself is untouched
  });

  it('plays the asked clip, falls back to idle when the pack has none, and disposes cleanly', () => {
    const t = fakeTemplate(1, ['Idle', 'Walk']);
    const m = animatedClone(t);
    const action = (name: string) => m.mixer.existingAction(t.animations.find((c) => c.name === name)!);
    expect(action('Idle')?.isRunning()).toBe(true);
    m.play('walk');
    m.mixer.update(0.5);
    expect(action('Walk')?.isRunning()).toBe(true);
    m.play('jump'); // no jump clip: back to idle
    m.mixer.update(0.5);
    expect(action('Idle')?.isRunning()).toBe(true);
    expect(() => m.dispose()).not.toThrow();
  });
});
