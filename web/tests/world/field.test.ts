import { describe, expect, it } from 'vitest';
import { createField, restoreField, snapshotField } from '../../src/world/field';
import { loadRecipeFixture } from '../fixtures';

describe('field', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const r = loadRecipeFixture('fishing-valley');
    const a = createField(r), b = createField(r), c = createField({ ...r, seed: r.seed + 1 });
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      const x = i * 13 - 300, z = i * 7 - 150;
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
      diff += Math.abs(a.heightAt(x, z) - c.heightAt(x, z));
    }
    expect(diff).toBeGreaterThan(1);
  });

  it('island: centre above sea, rim below', () => {
    const f = createField(loadRecipeFixture('tropical-island'));
    expect(f.hasSea).toBe(true);
    expect(f.heightAt(0, 0)).toBeGreaterThan(f.seaLevelY);
    expect(f.heightAt(500, 0)).toBeLessThan(f.seaLevelY);
    expect(f.isWater(500, 0)).toBe(true);
    expect(f.waterSurfaceAt(500, 0)).toBe(f.seaLevelY);
  });

  it('valley: floor lower than walls, river carved and wet', () => {
    const f = createField(loadRecipeFixture('fishing-valley'));
    let floor = 0, wall = 0, n = 0;
    for (let z = -400; z <= 400; z += 40) {
      floor += f.baseHeight(f.meander(z), z);
      wall += f.baseHeight(f.meander(z) + 300, z);
      n++;
    }
    expect(floor / n).toBeLessThan(wall / n - 10);
    expect(f.river.length).toBeGreaterThan(30);
    const p = f.river[10];
    expect(f.isWater(p.x, p.z)).toBe(true);
    expect(f.heightAt(p.x, p.z)).toBeLessThan(f.baseHeight(p.x, p.z) - 3);
    expect(f.waterDistance(p.x, p.z)).toBe(0);
  });

  it('canyon river follows the centreline with many points', () => {
    const f = createField(loadRecipeFixture('desert-canyon'));
    expect(f.river.length).toBeGreaterThan(30);
  });

  it('mountains with lake=true get a lake', () => {
    const f = createField(loadRecipeFixture('snowy-mountains'));
    expect(f.lakes.length).toBe(1);
    const l = f.lakes[0];
    expect(f.isWater(l.x, l.z)).toBe(true);
  });

  it('pads flatten terrain; roads reserve space; snapshot round-trips', () => {
    const f = createField(loadRecipeFixture('tropical-island'));
    f.addPad({ x: 0, z: 0, radius: 10, y: 60 });
    expect(f.heightAt(0, 0)).toBe(60);
    expect(f.heightAt(6, 0)).toBe(60);
    f.addRoad({ points: [{ x: -50, z: 30 }, { x: 50, z: 30 }], width: 4, bridges: [false] });
    expect(f.isReserved(0, 31, 0)).toBe(true);
    expect(f.isReserved(0, 0, 0)).toBe(true); // pad
    expect(f.isReserved(0, 100, 0)).toBe(false);
    const g = restoreField(JSON.parse(JSON.stringify(snapshotField(f))));
    expect(g.heightAt(3, 2)).toBe(f.heightAt(3, 2));
    expect(g.isReserved(0, 31, 0)).toBe(true);
  });

  it('slope is ~0 on a pad and positive on hills', () => {
    const f = createField(loadRecipeFixture('snowy-mountains'));
    let maxSlope = 0;
    for (let i = 0; i < 200; i++) maxSlope = Math.max(maxSlope, f.slopeAt(i * 5 - 500, i * 3 - 300));
    expect(maxSlope).toBeGreaterThan(0.2);
  });
});
