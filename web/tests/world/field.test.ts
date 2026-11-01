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
    f.addPad({ x: 300, z: 300, radius: 12, y: 50 });
    expect(f.slopeAt(300, 300)).toBeLessThan(0.01);
    expect(f.slopeAt(305, 298)).toBeLessThan(0.01);
  });

  it('pad blend is continuous across the water-proximity zone', () => {
    const f = createField(loadRecipeFixture('fishing-valley'));
    const c = f.river[60];
    const px = c.x + 28;
    f.addPad({ x: px, z: c.z, radius: 14, y: f.baseHeight(px, c.z) + 6 });
    let worst = 0;
    for (let dz = -30; dz <= 30; dz += 3) for (let x = c.x - 6; x <= px + 30; x += 1) {
      worst = Math.max(worst, Math.abs(f.heightAt(x + 1, c.z + dz) - f.heightAt(x, c.z + dz)));
    }
    expect(worst).toBeLessThan(2); // slope-limited, no vertical step
    const lake = createField(loadRecipeFixture('snowy-mountains')).lakes[0];
    expect(lake).toBeDefined();
  });

  it('water is consistent with terrain: wet implies below the surface (lake rim, river banks)', () => {
    const lf = createField(loadRecipeFixture('snowy-mountains'));
    const l = lf.lakes[0];
    for (let a = 0; a < 360; a += 5) for (const m of [0.9, 0.99, 1, 1.01, 1.1]) {
      const x = l.x + Math.cos(a * Math.PI / 180) * l.radius * m, z = l.z + Math.sin(a * Math.PI / 180) * l.radius * m;
      const s = lf.waterSurfaceAt(x, z);
      if (lf.isWater(x, z)) expect(lf.heightAt(x, z)).toBeLessThan(s as number);
      if (m <= 0.99) expect(lf.isWater(x, z)).toBe(true);
    }
    const rf = createField(loadRecipeFixture('fishing-valley'));
    for (let i = 5; i < rf.river.length; i += 7) for (let o = -30; o <= 30; o += 2) {
      const x = rf.river[i].x + o, z = rf.river[i].z;
      if (rf.isWater(x, z)) expect(rf.heightAt(x, z)).toBeLessThan(rf.waterSurfaceAt(x, z) as number);
    }
  });
});
