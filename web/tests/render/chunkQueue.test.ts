import { describe, expect, it } from 'vitest';
import { ChunkQueue, MAX_RETRIES, RETRY_BACKOFF_MS } from '../../src/render/chunkQueue';

describe('ChunkQueue', () => {
  it('does not re-request an in-flight key', () => {
    const q = new ChunkQueue();
    q.markPending('a');
    expect(q.canRequest('a', 0)).toBe(false);
  });
  it('frees a failed key only after backoff', () => {
    const q = new ChunkQueue();
    q.markPending('a'); q.fail('a', 0);
    expect(q.canRequest('a', RETRY_BACKOFF_MS - 1)).toBe(false);
    expect(q.canRequest('a', RETRY_BACKOFF_MS)).toBe(true);
  });
  it('still allows a key after exactly MAX_RETRIES failures, then gives up', () => {
    const q = new ChunkQueue();
    for (let i = 0; i < MAX_RETRIES; i++) { q.markPending('a'); q.fail('a', 0); }
    expect(q.canRequest('a', 1e9)).toBe(true);
    q.markPending('a'); q.fail('a', 0);
    expect(q.canRequest('a', 1e9)).toBe(false);
  });
  it('forget clears a given-up key so it can be requested again', () => {
    const q = new ChunkQueue();
    for (let i = 0; i <= MAX_RETRIES; i++) { q.markPending('a'); q.fail('a', 0); }
    expect(q.canRequest('a', 1e9)).toBe(false);
    q.forget('a');
    expect(q.canRequest('a', 0)).toBe(true);
  });
  it('forgetExcept clears failures outside the keep set and leaves pending keys alone', () => {
    const q = new ChunkQueue();
    for (let i = 0; i <= MAX_RETRIES; i++) { q.markPending('a'); q.fail('a', 0); }
    for (let i = 0; i <= MAX_RETRIES; i++) { q.markPending('b'); q.fail('b', 0); }
    q.markPending('c');
    q.forgetExcept(new Set(['a', 'c']));
    expect(q.canRequest('a', 1e9)).toBe(false);
    expect(q.canRequest('b', 1e9)).toBe(true);
    expect(q.canRequest('c', 1e9)).toBe(false);
  });
  it('success clears failures; failAll releases in-flight keys; reset forgets', () => {
    const q = new ChunkQueue();
    q.markPending('a'); q.fail('a', 0); q.markPending('a'); q.succeed('a');
    expect(q.canRequest('a', 0)).toBe(true);
    q.markPending('b'); q.failAll(0);
    expect(q.canRequest('b', 0)).toBe(false);
    q.reset();
    expect(q.canRequest('b', 0)).toBe(true);
  });
});
