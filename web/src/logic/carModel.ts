/** Arcade car handling (pure, no three.js): speed along a heading, steering that needs speed, a Shift boost. */
export const CAR = {
  accel: 12,
  boostAccel: 20,
  /** Top speeds in m/s (30 m/s = 108 km/h). */
  maxSpeed: 30,
  boostSpeed: 46,
  maxReverse: 8,
  brake: 28,
  /** Slowing when coasting (m/s²). */
  coast: 4,
  /** Yaw rate at full lock once moving (rad/s). */
  steerRate: 1.6,
} as const;

/** heading = rotation.y: forward is (sin h, cos h), so heading 0 faces +z. */
export interface CarState { speed: number; heading: number }
/** throttle W = 1, S = −1; steer A = 1 (left), D = −1; brake = Space; boost = Shift. */
export interface CarInput { throttle: number; steer: number; brake: boolean; boost: boolean }

const toward = (v: number, target: number, step: number): number => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export function stepCar(s: CarState, input: CarInput, dt: number): { state: CarState; dx: number; dz: number } {
  let speed = s.speed;
  if (input.brake) speed = toward(speed, 0, CAR.brake * dt);
  else if (input.throttle > 0) {
    const top = input.boost ? CAR.boostSpeed : CAR.maxSpeed;
    speed = speed < 0 ? toward(speed, 0, CAR.brake * dt) : speed > top ? toward(speed, top, CAR.coast * dt) : toward(speed, top, (input.boost ? CAR.boostAccel : CAR.accel) * input.throttle * dt);
  } else if (input.throttle < 0) {
    speed = speed > 0 ? toward(speed, 0, CAR.brake * dt) : toward(speed, -CAR.maxReverse, CAR.accel * -input.throttle * dt);
  } else speed = toward(speed, 0, CAR.coast * dt);
  // Steering needs the wheels to roll: full effect from 6 m/s; reversing turns the other way, like a real car.
  const grip = Math.max(-1, Math.min(1, speed / 6));
  const heading = s.heading + input.steer * CAR.steerRate * grip * dt;
  return { state: { speed, heading }, dx: Math.sin(heading) * speed * dt, dz: Math.cos(heading) * speed * dt };
}

export interface ParkEnv {
  heightAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  /** Something solid (a building, a tree trunk) already stands there. */
  blocked(x: number, z: number, heading: number): boolean;
}

/** Most height difference across the car's 4 m length for a spot to count as flat enough to park. */
const MAX_DROP = 1.2;

/** A dry, flat, free spot 7–11 m from (x, z) for the car parked at spawn, facing along the ring; null if none. */
export function parkingSpot(x: number, z: number, env: ParkEnv): { x: number; z: number; heading: number } | null {
  for (const r of [7, 9, 11]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const heading = a + Math.PI / 2;
      const fx = Math.sin(heading) * 2, fz = Math.cos(heading) * 2;
      const hs = [env.heightAt(px, pz), env.heightAt(px + fx, pz + fz), env.heightAt(px - fx, pz - fz), env.heightAt(px + fz, pz - fx), env.heightAt(px - fz, pz + fx)];
      if (Math.max(...hs) - Math.min(...hs) > MAX_DROP) continue;
      if (env.isWater(px, pz) || env.isWater(px + fx, pz + fz) || env.isWater(px - fx, pz - fz)) continue;
      if (env.blocked(px, pz, heading)) continue;
      return { x: px, z: pz, heading };
    }
  }
  return null;
}
