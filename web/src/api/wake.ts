import { health } from './client';

export interface Health { ok: boolean; provider: string }

export interface WakeDeps {
  check?: () => Promise<Health | null>;
  sleep?: (ms: number) => Promise<void>;
  tries?: number;
  intervalMs?: number;
}

/**
 * Pings /api/health on page load: a sleeping Render instance starts on the first request and can take about a minute,
 * so an unanswered ping is retried every `intervalMs` up to `tries` times (7 x 10 s by default, a handful of requests).
 * `onStatus(h, final)` is told the first result (so the UI can say "offline for now") and the final one.
 * Resolves with the first answer, or null when the backend never answered.
 */
export async function wakeBackend(onStatus: (h: Health | null, final: boolean) => void, deps: WakeDeps = {}): Promise<Health | null> {
  const check = deps.check ?? health;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tries = Math.max(1, deps.tries ?? 7);
  const interval = deps.intervalMs ?? 10_000;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(interval);
    const h = await check();
    const final = h !== null || i === tries - 1;
    if (i === 0 || final) onStatus(h, final);
    if (h) return h;
  }
  return null;
}
