/** Indices of the k lit points nearest to (ox, oy, oz), nearest first. */
export function pickNearestLit(points: ReadonlyArray<{ x: number; y: number; z: number; lit: boolean }>, ox: number, oy: number, oz: number, k: number): number[] {
  const scored: Array<[number, number]> = [];
  points.forEach((p, i) => {
    if (p.lit) scored.push([(p.x - ox) ** 2 + (p.y - oy) ** 2 + (p.z - oz) ** 2, i]);
  });
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, k).map((s) => s[1]);
}

/** True when a pushable has fallen through (or been shoved far below) the ground and must be reset. */
export function needsRecovery(bodyY: number, groundY: number): boolean {
  return bodyY < groundY - 2;
}
