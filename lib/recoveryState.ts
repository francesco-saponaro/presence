/**
 * Module-level state for the password-recovery flow.
 *
 * WHY the flag: calling supabase.auth.setSession() with a recovery token fires
 * SIGNED_IN, which would make _layout.tsx's onAuthStateChange call routeAfterAuth()
 * and navigate the user away from reset-password.tsx. The flag tells _layout.tsx
 * to skip routing for that event.
 *
 * WHY the URL store: Expo Router may consume the deep-link URL before
 * reset-password.tsx mounts. _layout.tsx (which mounts first) captures the raw
 * URL via Linking and stores it here so reset-password.tsx can always read it.
 */

let _inRecovery = false;
let _pendingResetUrl: string | null = null;

export function setInRecovery(value: boolean) {
  _inRecovery = value;
}

export function isInRecovery(): boolean {
  return _inRecovery;
}

export function storePendingResetUrl(url: string) {
  _pendingResetUrl = url;
}

/** Returns and clears the stored URL (call once from reset-password.tsx). */
export function consumePendingResetUrl(): string | null {
  const url = _pendingResetUrl;
  _pendingResetUrl = null;
  return url;
}
