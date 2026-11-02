/** Body-centre height above the ground when standing (capsule half-height 0.55 + radius 0.35, plus skin). */
export const FLOOR_OFFSET = 0.95;

/**
 * Degraded movement used while terrain collision is not ready: free horizontal move,
 * with the analytic heightfield as the floor so the player can never fall through.
 */
export function fallbackStep(
  pos: { x: number; y: number; z: number },
  move: { x: number; z: number },
  speed: number,
  dt: number,
  heightAt: (x: number, z: number) => number,
): { x: number; y: number; z: number } {
  const x = pos.x + move.x * speed * dt;
  const z = pos.z + move.z * speed * dt;
  return { x, y: Math.max(pos.y, heightAt(x, z) + FLOOR_OFFSET), z };
}
