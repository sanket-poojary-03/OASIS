/** Rocket booster rules (pure, no three.js): it fires only while its own key (F) is held; Space is always a plain jump. */
export const JET = {
  /** Upward acceleration while thrusting (gravity is 20), so a held booster climbs. */
  thrust: 34,
  /** Fastest climb. */
  maxUp: 9,
  /** Upward speed the booster starts from when it fires on the ground, so it leaves the ground at once. */
  liftOff: 2,
  /** Full tank → empty in 4 s of thrust. */
  drainPerS: 0.25,
  /** Empty → full in 2.5 s on the ground. */
  refillPerS: 0.4,
  /** Horizontal speed while boosting (Shift boosts harder). */
  speed: 9,
  boostSpeed: 18,
} as const;

/** Where the player is this frame: standing, off the ground, or swimming. */
export type JetWhere = 'ground' | 'air' | 'water';

export class Jetpack {
  /** 0 empty … 1 full. */
  fuel = 1;
  /** Thrusting this frame (flames, sound, HUD). */
  firing = false;
  /** Emptied with the key still held: it stays off until the key is let go, so a held key does not hop on refilled fuel. */
  private spent = false;

  /**
   * One frame. `held`: the booster key is down. Returns the new vertical speed.
   * Gravity is applied by the caller before this; thrust only adds to it.
   */
  update(dt: number, vy: number, held: boolean, where: JetWhere): number {
    if (!held) this.spent = false;
    this.firing = held && !this.spent && where !== 'water' && this.fuel > 0;
    if (this.firing) {
      this.fuel = Math.max(0, this.fuel - JET.drainPerS * dt);
      if (this.fuel === 0) this.spent = true;
      return Math.min(JET.maxUp, (where === 'ground' ? Math.max(vy, JET.liftOff) : vy) + JET.thrust * dt);
    }
    if (where !== 'air') this.fuel = Math.min(1, this.fuel + JET.refillPerS * dt);
    return vy;
  }
}
