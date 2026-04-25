/**
 * lib/nativeModules.ts
 *
 * Platform-aware JS wrappers for the custom native modules.
 * On iOS  → PresenceScreenTime (FamilyControls) + PresenceOCR (Vision)
 * On Android → PresenceBlocker (UsageStats / Overlay) + PresenceOCR (ML Kit)
 * On web  → no-op stubs so Metro doesn't crash during `expo start --web`
 */

import { NativeModules, Platform, DeviceEventEmitter } from "react-native";

// ── iOS ScreenTime ───────────────────────────────────────────────────────────

interface ScreenTimeModuleType {
  requestAuthorization(): Promise<void>;
  getAuthorizationStatus(): Promise<"approved" | "denied" | "notDetermined" | "unknown">;
  /** Shield specific apps by bundle ID (falls back to .all() if tokens are nil). */
  applyShield(bundleIds: string[]): Promise<{ tokensApplied: number; appsFound: number } | null>;
  /** Shield only the apps from a FamilyActivitySelection (base64-encoded). */
  applyShieldFromSelection(base64: string): Promise<void>;
  clearShield(): Promise<void>;
}

function buildScreenTimeStub(): ScreenTimeModuleType {
  const w = () =>
    Promise.reject(new Error("PresenceScreenTime is only available on iOS."));
  return {
    requestAuthorization: w,
    getAuthorizationStatus: w,
    applyShield: w,
    applyShieldFromSelection: w,
    clearShield: w,
  };
}

export const ScreenTimeModule: ScreenTimeModuleType =
  Platform.OS === "ios" && NativeModules.PresenceScreenTime
    ? NativeModules.PresenceScreenTime
    : buildScreenTimeStub();

// ── Android Blocker ──────────────────────────────────────────────────────────

interface BlockerModuleType {
  hasUsageStatsPermission(): Promise<boolean>;
  hasOverlayPermission(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  openOverlayPermissionSettings(): Promise<void>;
  openBatteryOptimizationSettings(): Promise<void>;
  startBlocker(blockedApps: string[]): Promise<void>;
  stopBlocker(): Promise<void>;
  getForegroundApp(): Promise<string | null>;
}

function buildBlockerStub(): BlockerModuleType {
  const w = () =>
    Promise.reject(new Error("PresenceBlocker is only available on Android."));
  return {
    hasUsageStatsPermission: () => Promise.resolve(false),
    hasOverlayPermission: () => Promise.resolve(false),
    openUsageAccessSettings: w,
    openOverlayPermissionSettings: w,
    openBatteryOptimizationSettings: w,
    startBlocker: w,
    stopBlocker: w,
    getForegroundApp: () => Promise.resolve(null),
  };
}

export const BlockerModule: BlockerModuleType =
  Platform.OS === "android" && NativeModules.PresenceBlocker
    ? NativeModules.PresenceBlocker
    : buildBlockerStub();

// ── OCR (both platforms) ─────────────────────────────────────────────────────

interface OCRModuleType {
  recognizeText(imagePath: string): Promise<string>;
}

const _nativeOCR: OCRModuleType | null =
  NativeModules.PresenceOCR ?? null;

export const OCRModule: OCRModuleType = {
  recognizeText(imagePath: string): Promise<string> {
    if (!_nativeOCR) {
      // Web / simulator fallback: return empty string so validation reports failure gracefully.
      return Promise.resolve("");
    }
    return _nativeOCR.recognizeText(imagePath);
  },
};

// ── iOS FamilyActivityPicker ─────────────────────────────────────────────────

export interface PickerApp {
  bundleId: string;
  name?: string;
}

export interface PickerResult {
  /** Base64-encoded FamilyActivitySelection — pass to ScreenTimeModule.applyShieldFromSelection */
  selection: string;
  /** Apps the user selected, with bundle IDs and display names */
  apps: PickerApp[];
}

interface PickerModuleType {
  /** Present the native FamilyActivityPicker sheet.
   *  initialBase64 — previously stored selection to pre-populate (pass null on first launch).
   *  Resolves with null if the user cancelled, or PickerResult on confirm. */
  show(initialBase64: string | null): Promise<PickerResult | null>;
}

function buildPickerStub(): PickerModuleType {
  return {
    show: () =>
      Promise.reject(new Error("PresencePicker is only available on iOS.")),
  };
}

export const PickerModule: PickerModuleType =
  Platform.OS === "ios" && NativeModules.PresencePicker
    ? NativeModules.PresencePicker
    : buildPickerStub();

// ── Android shield-activation event ─────────────────────────────────────────
// BlockerService sends a broadcast → BlockerModule re-emits as a JS event.
// Subscribe in shieldEngine.ts to force-activate the shield from the background service.

export const SHIELD_ACTIVATED_EVENT = "onShieldActivated";

export function addShieldActivatedListener(callback: () => void) {
  const sub = DeviceEventEmitter.addListener(SHIELD_ACTIVATED_EVENT, callback);
  return () => sub.remove();
}
