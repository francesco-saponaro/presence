/**
 * lib/shieldEngine.ts
 *
 * Orchestrates the entire blocking lifecycle:
 *   • Checks whether the shield should be active when the app foregrounds.
 *   • Activates / deactivates the native shield (iOS FamilyControls or Android service).
 *   • Handles successful OCR verification (lift shield, log connection, sync).
 *   • Handles manual bypass (lift shield, log bypass).
 *   • Syncs pending offline connections to Supabase when online.
 *   • Listens for the Android shield-activation event from BlockerService.
 *
 * Call startShieldEngine() once from the root layout.
 */

import { AppState, AppStateStatus, Platform } from "react-native";
import { useShieldStore } from "@/store/shield";
import { useRoutineStore } from "@/store/routine";
import { useUserStore } from "@/store/userStore";
import { isBlockTimeActive } from "./timezone";
import { ScreenTimeModule, BlockerModule, addShieldActivatedListener } from "./nativeModules";
import { supabase } from "./supabase";

// ── Native shield primitives ─────────────────────────────────────────────────

async function activateNativeShield(blockedApps: string[]): Promise<void> {
  if (Platform.OS === "ios") {
    await ScreenTimeModule.applyShield(blockedApps).catch(console.warn);
  } else if (Platform.OS === "android") {
    await BlockerModule.startBlocker(blockedApps).catch(console.warn);
  }
}

async function deactivateNativeShield(): Promise<void> {
  if (Platform.OS === "ios") {
    await ScreenTimeModule.clearShield().catch(console.warn);
  } else if (Platform.OS === "android") {
    await BlockerModule.stopBlocker().catch(console.warn);
  }
}

// ── Schedule check ───────────────────────────────────────────────────────────

/**
 * Evaluate whether the shield should be active based on the user's routine
 * and the current local time. Update Zustand + native layer accordingly.
 */
export async function checkAndUpdateShield(): Promise<void> {
  const { blockTimeUtc, frequency, blockedApps } = useRoutineStore.getState();
  const { isBlocked, setBlocked } = useShieldStore.getState();

  // No routine configured yet → nothing to do
  if (!blockTimeUtc || !frequency || blockedApps.length === 0) return;

  const shouldBlock = isBlockTimeActive(blockTimeUtc, frequency);

  if (shouldBlock && !isBlocked) {
    setBlocked(true);
    await activateNativeShield(blockedApps);
  } else if (!shouldBlock && isBlocked) {
    setBlocked(false);
    await deactivateNativeShield();
  }
}

// ── Post-verification actions ────────────────────────────────────────────────

/**
 * Call this after a successful OCR verification (or manual bypass).
 * Lifts the shield, increments the lifetime counter, and queues a Supabase sync.
 */
export async function onConnectionVerified(wasManualBypass = false): Promise<void> {
  const { setBlocked, addPendingConnection, resetOcrFail } = useShieldStore.getState();
  const { incrementConnections } = useUserStore.getState();

  const timestamp = new Date().toISOString();

  setBlocked(false);
  resetOcrFail();
  addPendingConnection(timestamp);
  incrementConnections();

  await deactivateNativeShield();
  // Fire-and-forget: sync happens opportunistically
  syncPendingConnections().catch(console.warn);
}

// ── Offline sync ─────────────────────────────────────────────────────────────

/**
 * Push any locally cached connection proofs to Supabase.
 * Safe to call repeatedly (idempotent via `synced` flag).
 */
export async function syncPendingConnections(): Promise<void> {
  const { pendingConnections, markConnectionSynced } = useShieldStore.getState();
  const unsynced = pendingConnections.filter((c) => !c.synced);
  if (unsynced.length === 0) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  for (const conn of unsynced) {
    const { error } = await supabase.from("connection_proofs").insert({
      user_id: session.user.id,
      verified_at: conn.timestamp,
      was_bypass: false,
    });
    if (!error) markConnectionSynced(conn.timestamp);
  }

  // Mirror the lifetime count into the profiles table
  const total = useUserStore.getState().lifetimeSuccessfulConnections;
  await supabase
    .from("profiles")
    .update({ lifetime_connections: total })
    .eq("id", session.user.id)
    .catch(console.warn);
}

// ── Engine lifecycle ─────────────────────────────────────────────────────────

/**
 * Start the engine. Returns a cleanup function.
 *
 * What it does:
 *   1. Immediate schedule check on startup.
 *   2. AppState listener: re-checks every time the app foregrounds.
 *   3. Android: listens for BlockerService events so the shield can activate
 *      even when the user is in a third-party app.
 *   4. Opportunistic sync of any pending offline connections.
 */
export function startShieldEngine(): () => void {
  checkAndUpdateShield().catch(console.warn);
  syncPendingConnections().catch(console.warn);

  // AppState: foreground re-check (anti-cheat)
  const handleAppState = (next: AppStateStatus) => {
    if (next === "active") checkAndUpdateShield().catch(console.warn);
  };
  const appStateSub = AppState.addEventListener("change", handleAppState);

  // Android: receive shield trigger from the background service
  let removeShieldListener = () => {};
  if (Platform.OS === "android") {
    removeShieldListener = addShieldActivatedListener(() => {
      // The service says a blocked app is in foreground — confirm and set state
      const { isBlocked, setBlocked } = useShieldStore.getState();
      if (!isBlocked) setBlocked(true);
    });
  }

  return () => {
    appStateSub.remove();
    removeShieldListener();
  };
}
