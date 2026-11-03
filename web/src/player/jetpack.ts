/** Rocket booster rules (pure, no three.js): tap Space = jump as before; hold Space in the air = thrust. */
export const JET = {
  /** Upward acceleration while thrusting (gravity is 20), so a held booster climbs. */
  thrust: 34,
  /** Fastest climb. */
  maxUp: 9,
  /** Air time before a held Space fires the booster, so a quick tap is still a plain jump. */
  holdDelay: 0.2,
  /** Full tank → empty in 4 s of thrust. */
  drainPerS: 0.25,
  /** Empty → full in 2.5 s on the ground. */
  refillPerS: 0.4,
  /** Horizontal speed while boosting (Shift boosts harder). */
  speed: 9,
  boostSpeed: 18,
} as const;

export class Jetpack {
  /** 0 empty … 1 full. */
  fuel = 1;
  /** Thrusting this frame (flames, sound, HUD). */
  firing = false;
  private airTime = 0;

  /**
   * One frame. `held`: Space is down; `airborne`: not on the ground and not swimming. Returns the new vertical speed.
   * Gravity is applied by the caller before this; thrust only adds to it.
   */
  update(dt: number, vy: number, held: boolean, airborne: boolean): number {
    this.airTime = airborne ? this.airTime + dt : 0;
    this.firing = airborne && held && this.fuel > 0 && this.airTime >= JET.holdDelay;
    if (this.firing) {
      this.fuel = Math.max(0, this.fuel - JET.drainPerS * dt);
      return Math.min(JET.maxUp, vy + JET.thrust * dt);
    }
    if (!airborne) this.fuel = Math.min(1, this.fuel + JET.refillPerS * dt);
    return vy;
  }
}
