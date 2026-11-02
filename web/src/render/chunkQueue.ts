/** Pending/retry bookkeeping for chunk requests. Pure: time is passed in. */
export const MAX_RETRIES = 3;
export const RETRY_BACKOFF_MS = 1000;

export class ChunkQueue {
  private readonly pending = new Set<string>();
  private readonly failures = new Map<string, { count: number; retryAt: number }>();

  /** True when the key may be requested now (not in flight, not backing off, not given up). */
  canRequest(key: string, now: number): boolean {
    if (this.pending.has(key)) return false;
    const f = this.failures.get(key);
    return !f || (f.count <= MAX_RETRIES && now >= f.retryAt);
  }

  /** True once the key has used up its retries: it will not be requested again until forget() or reset(). */
  gaveUp(key: string): boolean { return (this.failures.get(key)?.count ?? 0) > MAX_RETRIES; }

  markPending(key: string): void { this.pending.add(key); }

  /** Chunk arrived: forget the key and its failures. */
  succeed(key: string): void { this.pending.delete(key); this.failures.delete(key); }

  /** Chunk failed: free the key, retry after a growing delay, up to MAX_RETRIES. */
  fail(key: string, now: number): void {
    this.pending.delete(key);
    const count = (this.failures.get(key)?.count ?? 0) + 1;
    this.failures.set(key, { count, retryAt: now + RETRY_BACKOFF_MS * 2 ** (count - 1) });
  }

  /** Chunk left the world (dropped/unloaded): clear its failure record so a return visit retries from scratch. */
  forget(key: string): void { this.failures.delete(key); }

  /** Clear failure records for every key not in `keep` (keys that left the view radius). Pending keys are untouched. */
  forgetExcept(keep: Set<string>): void {
    for (const k of [...this.failures.keys()]) if (!keep.has(k)) this.failures.delete(k);
  }

  /** Worker-wide failure: release everything in flight so it is re-requested (counts as a failure each). */
  failAll(now: number): void { for (const k of [...this.pending]) this.fail(k, now); }

  /** New world generation: forget everything. */
  reset(): void { this.pending.clear(); this.failures.clear(); }
}
