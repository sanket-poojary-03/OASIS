import { describe, expect, it } from 'vitest';
import { isKeyShaped, keyStore, type KeyStorage } from '../../src/api/userKey';

const memory = (): KeyStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('bring your own key: the store', () => {
  it('saves a key trimmed, reads it back, and forgets it', () => {
    const s = memory(), store = keyStore(() => s);
    expect(store.get()).toBeNull();
    expect(store.set('  sk_player_key_123  ')).toBe(true);
    expect(store.get()).toBe('sk_player_key_123');
    store.clear();
    expect(store.get()).toBeNull();
    expect(s.data.size).toBe(0);
  });

  it('refuses a malformed key and keeps the one it had', () => {
    const store = keyStore(memory);
    const s = memory(), kept = keyStore(() => s);
    kept.set('sk_player_key_123');
    for (const bad of ['short', 'has a space in it', 'x'.repeat(301), '']) expect(kept.set(bad)).toBe(false);
    expect(kept.get()).toBe('sk_player_key_123');
    expect(store.set('short')).toBe(false);
  });

  it('a stored value that is not key-shaped reads as no key', () => {
    const s = memory();
    s.setItem('oasis.llmKey', 'not a key');
    expect(keyStore(() => s).get()).toBeNull();
  });

  it('works without storage (private window, blocked site data): no key, no throw', () => {
    const none = keyStore(() => null);
    expect(none.get()).toBeNull();
    expect(none.set('sk_player_key_123')).toBe(false);
    expect(() => none.clear()).not.toThrow();
    const throwing = keyStore(() => ({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } }));
    expect(throwing.get()).toBeNull();
    expect(throwing.set('sk_player_key_123')).toBe(false);
    expect(() => throwing.clear()).not.toThrow();
  });

  it('matches the server rule: printable, no spaces, 8 to 300 characters', () => {
    expect(isKeyShaped('sk_abc12')).toBe(true);
    expect(isKeyShaped('sk_abc1')).toBe(false);
    expect(isKeyShaped('a'.repeat(300))).toBe(true);
    expect(isKeyShaped('a'.repeat(301))).toBe(false);
    expect(isKeyShaped('abc\tdefgh')).toBe(false);
  });
});
