export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface WaitUntilOptions {
  /** True when the wait can never finish (e.g. the chunk it waits for was given up): stop at once. */
  failed?: () => boolean;
  timeoutMs: number;
  /** Resolves on the next frame (requestAnimationFrame in the app). */
  frame: () => Promise<void>;
  now?: () => number;
  /** The most one frame gap may count, so a hidden tab (no frames for a while) does not use up the budget. */
  maxStepMs?: number;
}

/** Waits frame by frame until `done()`: true when it holds, false on `failed()` or after `timeoutMs` of frame time. */
export async function waitUntil(done: () => boolean, o: WaitUntilOptions): Promise<boolean> {
  const now = o.now ?? (() => performance.now());
  const maxStep = o.maxStepMs ?? 100;
  let spent = 0, last = now();
  while (!done()) {
    if (o.failed?.() || spent >= o.timeoutMs) return false;
    await o.frame();
    const t = now();
    spent += Math.min(t - last, maxStep);
    last = t;
  }
  return true;
}
