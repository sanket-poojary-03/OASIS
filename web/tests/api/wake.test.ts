import { describe, expect, it, vi } from 'vitest';
import { wakeBackend } from '../../src/api/wake';

describe('wakeBackend (I8: ping /api/health on load to wake a sleeping backend)', () => {
  it('answers at once when the backend is up', async () => {
    const check = vi.fn(async () => ({ ok: true, provider: 'live' }));
    const onStatus = vi.fn();
    expect(await wakeBackend(onStatus, { check, sleep: async () => {} })).toEqual({ ok: true, provider: 'live' });
    expect(check).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls).toEqual([[{ ok: true, provider: 'live' }, true]]);
  });

  it('keeps pinging a cold-starting backend and reports when it wakes', async () => {
    const check = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ ok: true, provider: 'mock' });
    const sleep = vi.fn(async () => {});
    const onStatus = vi.fn();
    expect(await wakeBackend(onStatus, { check, sleep, intervalMs: 10 })).toEqual({ ok: true, provider: 'mock' });
    expect(check).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(onStatus.mock.calls).toEqual([[null, false], [{ ok: true, provider: 'mock' }, true]]);
  });

  it('gives up after a few tries (a handful of requests, never a storm)', async () => {
    const check = vi.fn(async () => null);
    const onStatus = vi.fn();
    expect(await wakeBackend(onStatus, { check, sleep: async () => {}, tries: 4 })).toBeNull();
    expect(check).toHaveBeenCalledTimes(4);
    expect(onStatus.mock.calls).toEqual([[null, false], [null, true]]);
  });
});
