import { describe, expect, it } from 'vitest';
import { groundPose } from '../../src/world/groundPose';

const base = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };
/** Where a local point of a posed model lands (the same rotation order as the world objects: Y, then X, then Z). */
function lands(pose: { y: number; tiltX: number; tiltZ: number }, x: number, z: number, lx: number, lz: number): { y: number; wx: number; wz: number } {
  const sx = Math.sin(pose.tiltX), cx = Math.cos(pose.tiltX), sz = Math.sin(pose.tiltZ), cz = Math.cos(pose.tiltZ);
  const px = lx * cz, py = lx * sz, pz = lz;
  return { y: pose.y + py * cx - pz * sx, wx: x + px, wz: z + py * sx + pz * cx };
}

describe('groundPose', () => {
  it('leaves a model alone on flat ground', () => {
    expect(groundPose(() => 7, 3, 4, 1, base, 2, true)).toEqual({ y: 7, tiltX: -0, tiltZ: 0 });
    expect(groundPose(() => 7, 3, 4, 1, base, 2, false)).toEqual({ y: 7, tiltX: -0, tiltZ: 0 });
  });

  it('sinks an upright model until its low side touches, and does not tilt it', () => {
    const slope = (x: number) => x * 0.3; // 30 cm per metre across x
    const pose = groundPose(slope, 0, 0, 0, base, 10, false);
    expect(pose.tiltX === 0 && pose.tiltZ === 0).toBe(true);
    expect(pose.y).toBeCloseTo(-0.33, 5); // 1 m to the low side, plus the small extra
  });

  it('leans a low model onto the slope, leaving no gap under either end', () => {
    const slope = (_x: number, z: number) => 5 + z * 0.3;
    const pose = groundPose(slope, 0, 0, 0, base, 1.6, true);
    for (const lz of [-2, 2]) {
      const p = lands(pose, 0, 0, 0, lz);
      expect(Math.abs(p.y - slope(p.wx, p.wz))).toBeLessThan(0.12);
    }
    expect(pose.tiltX).toBeCloseTo(-Math.atan(0.3), 5); // the +z end goes up
  });

  it('reads the slope along the turned model', () => {
    const slope = (x: number) => x * 0.2;
    const pose = groundPose(slope, 0, 0, Math.PI / 2, base, 1.6, true); // local +z now points along world +x
    expect(pose.tiltZ).toBeCloseTo(0, 5);
    expect(pose.tiltX).toBeCloseTo(-Math.atan(0.2), 5);
  });

  it('caps how far a model leans and sinks, so a steep site never buries it', () => {
    const cliff = (x: number) => x * 3;
    expect(Math.abs(groundPose(cliff, 0, 0, 0, base, 1.6, true).tiltZ)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(groundPose(cliff, 0, 0, 0, base, 2, false).y).toBeCloseTo(-0.4, 5); // a fifth of its height
    expect(groundPose(cliff, 0, 0, 0, base, 40, false).y).toBeCloseTo(-1.5, 5); // and never over 1.5 m
  });

  it('still finds the slope under a very narrow base (a thin post)', () => {
    const slope = (x: number) => x * 0.4;
    const pose = groundPose(slope, 0, 0, 0, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, 4, false);
    expect(pose.y).toBeLessThan(0);
  });
});
