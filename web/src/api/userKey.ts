/**
 * Bring your own key: a player may give their own AI key, kept only in this browser and sent with each AI request
 * (header x-llm-key) so the server uses it instead of its own. Without one, the server's key and daily budget apply.
 */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NAME = 'oasis.llmKey';

/** The server's rule (backend KEY_SHAPE): printable, no spaces, 8 to 300 characters. */
export const isKeyShaped = (key: string): boolean => /^[\x21-\x7e]{8,300}$/.test(key);

/** Storage can be missing or throw (private window, blocked site data): then there is simply no key. */
export function keyStore(storage: () => KeyStorage | null) {
  return {
    get(): string | null {
      try {
        const key = storage()?.getItem(NAME) ?? null;
        return key && isKeyShaped(key) ? key : null;
      } catch {
        return null;
      }
    },
    /** False when the key is malformed or cannot be kept; the key already saved stays. */
    set(raw: string): boolean {
      const key = raw.trim();
      if (!isKeyShaped(key)) return false;
      try {
        const s = storage();
        if (!s) return false;
        s.setItem(NAME, key);
        return true;
      } catch {
        return false;
      }
    },
    clear(): void {
      try { storage()?.removeItem(NAME); } catch { /* nothing kept, nothing to forget */ }
    },
  };
}

export const userKey = keyStore(() => {
  try { return (globalThis as { localStorage?: KeyStorage }).localStorage ?? null; } catch { return null; }
});
