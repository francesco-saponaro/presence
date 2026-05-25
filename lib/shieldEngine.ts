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

import { Alert, AppState, AppStateStatus, Linking, Platform } from "react-native";
import i18n from "@/i18n";
import { useShieldStore } from "@/store/shield";
import { useRoutineStore } from "@/store/routine";
import { useUserStore } from "@/store/userStore";
import { isBlockTimeActive, getLocalBlockTime } from "./timezone";
import { ScreenTimeModule, BlockerModule, addShieldActivatedListener, addScreenTimeAuthChangedListener } from "./nativeModules";
import { supabase } from "./supabase";
import { scheduleInactivityNotification, cancelWarmupNotification } from "./notifications";

// Throttle the "Screen Time revoked" alert to once per app session.
let _screenTimeAlertShown = false;

/**
 * Show a prominent alert when Screen Time has been revoked for Presence
 * (authorization status "denied"). iOS forbids re-showing the native
 * FamilyControls modal once denied (same privacy rule as Camera / Photos), so
 * deep-linking the user to Settings is the only way back. Throttled to once
 * per app session unless `force` is set (e.g. when the user actively saves a
 * schedule and we want immediate feedback).
 */
function alertScreenTimeRevoked(force = false): void {
  if (!force && _screenTimeAlertShown) return;
  _screenTimeAlertShown = true;
  Alert.alert(
    i18n.t("blockTime.screenTimeOffTitle"),
    i18n.t("blockTime.screenTimeOffAlertBody"),
    [
      { text: i18n.t("blockTime.notNow"), style: "cancel" },
      {
        text: i18n.t("blockTime.openSettings"),
        onPress: () => {
          Linking.openURL("app-settings:");
        },
      },
    ]
  );
}

// ── Screen Time auth helpers ─────────────────────────────────────────────────

/**
 * Call this when the user schedules or edits a block time.
 * If FamilyControls is not authorised it shows the native system prompt
 * (notDetermined), or a tappable Settings-deep-link toast (denied).
 */
export async function ensureScreenTimeAuth(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const status = await ScreenTimeModule.getAuthorizationStatus();
    if (status === "approved") return;

    if (status === "denied") {
      // Screen Time was revoked in Settings — iOS won't re-show the native modal.
      alertScreenTimeRevoked(true);
      return;
    }

    // notDetermined (or unknown) — show the native FamilyControls system prompt
    await ScreenTimeModule.requestAuthorization().catch((e: unknown) =>
      console.warn("[shieldEngine] ensureScreenTimeAuth requestAuthorization:", JSON.stringify(e))
    );
  } catch {
    // Native module unavailable on simulator / old build — ignore
  }
}

/**
 * Deactivates the user's schedule entirely:
 * clears local Zustand state, stops the DeviceActivity monitor, lifts any
 * active shield, and cancels the warm-up notification.
 * Does NOT sync to Supabase (the DB row keeps the old values; when the user
 * creates a new schedule it will be overwritten by the next syncRoutineToSupabase).
 */
export async function deactivateSchedule(): Promise<void> {
  const { isBlocked, setBlocked } = useShieldStore.getState();
  const { clearSchedule } = useRoutineStore.getState();

  clearSchedule();

  if (isBlocked) {
    setBlocked(false);
    await deactivateNativeShield();
  }

  if (Platform.OS === "ios") {
    await ScreenTimeModule.stopMonitoring().catch(console.warn);
  }

  await cancelWarmupNotification().catch(console.warn);
}

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

  // iOS: re-check FamilyControls auth so we re-prompt when the user has turned
  // Screen Time off for Presence (status → notDetermined).
  //
  // CRITICAL: do NOT gate this on getAuthorizationStatus(). That property is a
  // cached value that does NOT refresh on a warm resume — when the user toggles
  // Screen Time off in Settings while Presence is only suspended (not killed),
  // the cached status stays "approved" and its Combine publisher never re-emits.
  // requestAuthorization() instead performs a LIVE check against the system: it
  // presents the native modal when the real state is notDetermined, and throws
  // (silently, no UI) when already approved or denied. That makes it the only
  // reliable re-prompt trigger across both cold start and warm resume.
  if (Platform.OS === "ios") {
    try {
      await ScreenTimeModule.requestAuthorization();
      // Resolved → authorized (freshly granted via the modal, or already approved).
    } catch {
      // Threw → already approved (iOS 16+ throws on re-request) OR denied. The
      // live requestAuthorization call refreshes the cached status, so read it
      // now: only a genuine "denied" (user tapped "Don't Allow") needs the
      // Settings alert, since denied cannot be re-prompted with the native modal.
      const status = await ScreenTimeModule.getAuthorizationStatus().catch(() => "approved");
      console.log("[shieldEngine] auth status after requestAuthorization threw:", status);
      if (status === "denied") {
        alertScreenTimeRevoked();
        return; // nothing more we can do until the user re-enables in Settings
      }
      // "approved" → proceed normally
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
  _screenTimeAlertShown = false; // reset per app session

  // Run the first schedule/auth check only once the routine store has hydrated
  // from AsyncStorage. On a cold start — which is exactly what happens after the
  // user toggles Presence's Screen Time off in iOS Settings, since iOS kills the
  // app — the persisted routine is NOT readable synchronously. A premature check
  // sees blockTimeUtc=null, bails at the routineReady guard, and never reaches
  // the Screen Time auth check, so the revoked-permission alert never fires.
  let removeHydrationListener = () => {};
  if (useRoutineStore.persist.hasHydrated()) {
    checkAndUpdateShield().catch(console.warn);
  } else {
    removeHydrationListener = useRoutineStore.persist.onFinishHydration(() => {
      checkAndUpdateShield().catch(console.warn);
    });
  }
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

  // iOS: observe FamilyControls auth status changes via Combine publisher.
  // Fires event-driven when the OS updates authorizationStatus (e.g. user turns
  // off Screen Time in Settings), so we always read a fresh value — no race
  // condition with AppState foreground reading stale state.
  let removeAuthListener = () => {};
  if (Platform.OS === "ios") {
    removeAuthListener = addScreenTimeAuthChangedListener((status) => {
      console.log("[shieldEngine] FamilyControls auth changed:", status);
      // checkAndUpdateShield() now performs the live requestAuthorization()
      // re-prompt itself, so just re-evaluate — avoids a double prompt.
      checkAndUpdateShield().catch(console.warn);
    });
  }

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
    removeHydrationListener();
    appStateSub.remove();
    removeAuthListener();
    removeShieldListener();
  };
}
