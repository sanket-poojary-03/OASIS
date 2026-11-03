import { describe, expect, it } from 'vitest';
import { CAR, parkingSpot, stepCar, type CarInput, type CarState } from '../../src/logic/carModel';

const idle: CarInput = { throttle: 0, steer: 0, brake: false, boost: false };
const drive = (s: CarState, input: Partial<CarInput>, seconds: number) => {
  let dx = 0, dz = 0;
  for (let t = 0; t < seconds; t += 0.01) { const r = stepCar(s, { ...idle, ...input }, 0.01); s = r.state; dx += r.dx; dz += r.dz; }
  return { s, dx, dz };
};

describe('stepCar', () => {
  it('W accelerates forward along the heading (+z at heading 0) up to the top speed', () => {
    const { s, dx, dz } = drive({ speed: 0, heading: 0 }, { throttle: 1 }, 8);
    expect(s.speed).toBeCloseTo(CAR.maxSpeed, 0);
    expect(dz).toBeGreaterThan(50);
    expect(Math.abs(dx)).toBeLessThan(1e-6);
  });

  it('Shift boosts past the normal top speed', () => {
    expect(drive({ speed: 0, heading: 0 }, { throttle: 1, boost: true }, 10).s.speed).toBeGreaterThan(CAR.maxSpeed + 5);
  });

  it('S brakes, then reverses slowly', () => {
    const { s } = drive({ speed: 20, heading: 0 }, { throttle: -1 }, 6);
    expect(s.speed).toBeCloseTo(-CAR.maxReverse, 0);
  });

  it('coasts to a stop, and Space brakes hard', () => {
    expect(drive({ speed: 20, heading: 0 }, {}, 12).s.speed).toBe(0);
    expect(drive({ speed: 20, heading: 0 }, { brake: true }, 1).s.speed).toBe(0);
  });

  it('A turns left (toward +x when heading +z); no turning while standing still', () => {
    expect(drive({ speed: 10, heading: 0 }, { throttle: 0.3, steer: 1 }, 0.5).s.heading).toBeGreaterThan(0.3);
    expect(drive({ speed: 0, heading: 0 }, { steer: 1 }, 1).s.heading).toBe(0);
  });
});

describe('parkingSpot', () => {
  const flat = () => 10;
  it('picks a dry, flat, free spot a few metres from the spawn and faces along the ring', () => {
    const spot = parkingSpot(0, 0, { heightAt: flat, isWater: () => false, blocked: () => false });
    expect(spot).not.toBeNull();
    expect(Math.hypot(spot!.x, spot!.z)).toBeGreaterThan(5);
    expect(Math.hypot(spot!.x, spot!.z)).toBeLessThan(15);
  });
  it('skips water and blocked spots; none at all when everything is unusable', () => {
    const spot = parkingSpot(0, 0, { heightAt: flat, isWater: (x) => x > 0, blocked: (_x, z) => z > 0 });
    expect(spot!.x).toBeLessThanOrEqual(0);
    expect(spot!.z).toBeLessThanOrEqual(0);
    expect(parkingSpot(0, 0, { heightAt: flat, isWater: () => true, blocked: () => false })).toBeNull();
  });
  it('avoids steep ground', () => {
    const slope = (x: number) => (x > 0 ? x * 2 : 0); // a cliff to the east
    const spot = parkingSpot(0, 0, { heightAt: slope, isWater: () => false, blocked: () => false });
    expect(spot!.x).toBeLessThanOrEqual(0.01);
  });
});
