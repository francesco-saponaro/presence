/**
 * Tiny client-side UUIDv4. Prefers `crypto.randomUUID()` when available
 * (Hermes / modern web), falls back to a Math.random-based generator that is
 * good enough for client-scoped IDs (user has tens of contacts at most, so
 * collision probability is negligible).
 *
 * Avoiding `expo-crypto` keeps this dependency-free.
 */
export function uuidv4(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) {
    try {
      return c.randomUUID();
    } catch {
      // Fall through to manual generator
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
