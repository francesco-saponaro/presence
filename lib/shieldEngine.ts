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
import Toast from "react-native-toast-message";
import { useShieldStore } from "@/store/shield";
import { useRoutineStore } from "@/store/routine";
import { useUserStore } from "@/store/userStore";
import { isBlockTimeActive, getLocalBlockTime } from "./timezone";
import { ScreenTimeModule, BlockerModule, addShieldActivatedListener } from "./nativeModules";
import { supabase } from "./supabase";
import { scheduleInactivityNotification } from "./notifications";

// Throttle the "Screen Time disabled" toast to once per app session.
let _screenTimeWarningShown = false;

// ── Native shield primitives ─────────────────────────────────────────────────

async function activateNativeShield(blockedApps: string[]): Promise<void> {
  if (Platform.OS === "ios") {
    try {
      // Always check auth first — ManagedSettingsStore is a silent no-op without it
      const authStatus = await ScreenTimeModule.getAuthorizationStatus();
      console.log("[shieldEngine] FamilyControls auth status:", authStatus);
      if (authStatus !== "approved") {
        await ScreenTimeModule.requestAuthorization().catch((e: unknown) =>
          console.warn("[shieldEngine] requestAuthorization failed:", JSON.stringify(e))
        );
      }

      const { familyActivitySelection } = useRoutineStore.getState();
      if (familyActivitySelection) {
        // Use real ApplicationTokens from FamilyActivityPicker — specific app blocking
        console.log("[shieldEngine] using FamilyActivitySelection for shield");
        await ScreenTimeModule.applyShieldFromSelection(familyActivitySelection);
        console.log("[shieldEngine] applyShieldFromSelection done");
      } else {
        // No picker selection yet — fall back to bundle ID method
        // (will fall back to .all() categories internally if tokens are nil)
        const result = await ScreenTimeModule.applyShield(blockedApps);
        console.log("[shieldEngine] applyShield result:", JSON.stringify(result));
      }
    } catch (e) {
      console.warn("[shieldEngine] shield FAILED:", JSON.stringify(e));
    }
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

  console.log("[shieldEngine] checkAndUpdateShield:", { blockTimeUtc, frequency, blockedApps, isBlocked });

  // No routine configured → clear stale shield and bail.
  // iOS only needs blockTimeUtc + frequency (shield uses familyActivitySelection or .all() fallback).
  // Android also needs blockedApps (package names drive UsageStatsManager).
  const routineReady =
    !!blockTimeUtc &&
    !!frequency &&
    (Platform.OS === "ios" || blockedApps.length > 0);

  if (!routineReady) {
    console.log("[shieldEngine] no routine configured, clearing any stale shield");
    if (isBlocked) {
      setBlocked(false);
      await deactivateNativeShield();
    }
    return;
  }

  // iOS: always check FamilyControls auth on foreground so we respond immediately
  // when the user toggles Screen Time in Settings.
  if (Platform.OS === "ios") {
    try {
      const authStatus = await ScreenTimeModule.getAuthorizationStatus();
      console.log("[shieldEngine] auth status on check:", authStatus);

      if (authStatus === "denied") {
        // Screen Time was disabled in Settings. iOS does not allow
        // requestAuthorization() to re-prompt — the user must re-enable manually.
        if (!_screenTimeWarningShown) {
          _screenTimeWarningShown = true;
          Toast.show({
            type: "error",
            text1: "Screen Time disabled",
            text2: "Re-enable Screen Time in Settings to keep Presence active.",
            visibilityTime: 6000,
          });
        }
        return; // nothing more we can do until user re-enables Screen Time
      } else if (authStatus === "notDetermined") {
        // Never authorised (fresh install or reset) — show the system prompt.
        console.log("[shieldEngine] auth notDetermined, requesting...");
        await ScreenTimeModule.requestAuthorization().catch((e: unknown) =>
          console.warn("[shieldEngine] requestAuthorization failed:", JSON.stringify(e))
        );
      }
      // "approved" → nothing to do, proceed normally
    } catch {
      // getAuthorizationStatus unavailable (simulator / old build) — ignore
    }
  }

  // iOS: keep DeviceActivityMonitor schedule in sync so apps are blocked at
  // block time even when Presence is not running.
  if (Platform.OS === "ios") {
    const { familyActivitySelection } = useRoutineStore.getState();
    const { hour, minute } = getLocalBlockTime(blockTimeUtc!); // non-null: routineReady guard above
    ScreenTimeModule.scheduleMonitoring(
      familyActivitySelection ?? "",
      hour,
      minute,
      frequency
    ).catch((e: unknown) =>
      console.warn("[shieldEngine] scheduleMonitoring failed:", JSON.stringify(e))
    );
  }

  const shouldBlock = isBlockTimeActive(blockTimeUtc, frequency);
  console.log("[shieldEngine] shouldBlock:", shouldBlock);

  if (shouldBlock) {
    // Always re-apply the native shield when block time is active.
    // isBlocked may already be true from persisted Zustand state, but
    // ManagedSettingsStore (iOS) needs to be re-applied on every app start
    // because the OS-level shield is not guaranteed to survive process restarts.
    if (!isBlocked) setBlocked(true);
    const { NativeModules } = require("react-native");
    console.log("[shieldEngine] PresenceScreenTime module present:", !!NativeModules.PresenceScreenTime);
    console.log("[shieldEngine] activating native shield with:", blockedApps);
    await activateNativeShield(blockedApps);
    console.log("[shieldEngine] native shield activated");
  } else if (isBlocked) {
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
  const { recordConnection } = useUserStore.getState();

  const timestamp = new Date().toISOString();

  setBlocked(false);
  resetOcrFail();
  addPendingConnection(timestamp);
  recordConnection();

  await deactivateNativeShield();

  // Reset the 48-hour inactivity notification from this moment
  scheduleInactivityNotification().catch(console.warn);

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

  // Mirror lifetime count + streak into the profiles table
  const { lifetimeSuccessfulConnections, currentStreak } = useUserStore.getState();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      lifetime_connections: lifetimeSuccessfulConnections,
      current_streak: currentStreak,
    })
    .eq("id", session.user.id);
  if (updateError) console.warn("[shieldEngine] profile update:", updateError);
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
  _screenTimeWarningShown = false; // reset per app session
  checkAndUpdateShield().catch(console.warn);
  syncPendingConnections().catch(console.warn);

  // AppState: foreground re-check (anti-cheat)
  const handleAppState = (next: AppStateStatus) => {
    if (next === "active") {
      checkAndUpdateShield().catch(console.warn);
      // Opportunistic sync: push any offline-cached connections to Supabase
      syncPendingConnections().catch(console.warn);
    }
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
