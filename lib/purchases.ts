/**
 * RevenueCat wrapper — Phase 7
 *
 * Replace the placeholder API keys before submitting to stores:
 *   REVENUECAT_API_KEY_IOS   → found in RevenueCat dashboard → Apps → iOS → Public SDK key
 *   REVENUECAT_API_KEY_ANDROID → found in RevenueCat dashboard → Apps → Android → Public SDK key
 *
 * The entitlement identifier "premium" must match what you created in RevenueCat dashboard.
 */

import { Platform } from "react-native";
import Purchases, {
  type PurchasesPackage,
  type CustomerInfo,
  LOG_LEVEL,
} from "react-native-purchases";

// ─── Replace with your real keys ─────────────────────────────────────────────
const RC_API_KEY_IOS = "appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const RC_API_KEY_ANDROID = "goog_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const ENTITLEMENT_ID = "premium";
// ─────────────────────────────────────────────────────────────────────────────

export function configurePurchases(): void {
  const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;

  if (!apiKey || apiKey.includes("XXXX")) {
    if (__DEV__) {
      console.warn("[Purchases] RevenueCat API key not set — purchases disabled.");
    }
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey });
}

/** Sync the Supabase user ID so RevenueCat ties purchases to this user. */
export async function identifyPurchasesUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    if (__DEV__) console.warn("[Purchases] logIn failed:", e);
  }
}

/** Reset RevenueCat identity on sign-out. */
export async function resetPurchasesUser(): Promise<void> {
  try {
    await Purchases.logOut();
  } catch (e) {
    // Silently ignore — logOut fails if no user is identified
  }
}

/**
 * Fetch the first available RevenueCat offering.
 * Returns null if none are configured or the SDK key is a placeholder.
 */
export async function getAnnualPackage(): Promise<PurchasesPackage | null> {
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;

    // Prefer the annual package; fall back to the first available
    return current.annual ?? current.availablePackages[0] ?? null;
  } catch (e) {
    if (__DEV__) console.warn("[Purchases] getOfferings failed:", e);
    return null;
  }
}

/**
 * Execute a purchase for the given package.
 * Returns CustomerInfo on success; throws on failure.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/**
 * Restore prior purchases (App Store / Play Store).
 * Returns CustomerInfo on success; throws on failure.
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/**
 * Check if the current user has an active "premium" entitlement.
 * Returns { isActive, expiresAt } where expiresAt is a UTC ISO string or null.
 */
export async function checkEntitlement(): Promise<{
  isActive: boolean;
  expiresAt: string | null;
}> {
  try {
    const info = await Purchases.getCustomerInfo();
    const entitlement = info.entitlements.active[ENTITLEMENT_ID];
    if (entitlement) {
      return {
        isActive: true,
        expiresAt: entitlement.expirationDate ?? null,
      };
    }
    return { isActive: false, expiresAt: null };
  } catch (e) {
    if (__DEV__) console.warn("[Purchases] checkEntitlement failed:", e);
    return { isActive: false, expiresAt: null };
  }
}

/**
 * Extract subscription status from a CustomerInfo object returned after purchase/restore.
 */
export function extractEntitlement(info: CustomerInfo): {
  isActive: boolean;
  expiresAt: string | null;
} {
  const entitlement = info.entitlements.active[ENTITLEMENT_ID];
  if (entitlement) {
    return {
      isActive: true,
      expiresAt: entitlement.expirationDate ?? null,
    };
  }
  return { isActive: false, expiresAt: null };
}
