import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useUserStore } from "@/store/userStore";

const STEP_ROUTES: Record<number, string> = {
  1: "/(onboarding)/step-1-hook",
  2: "/(onboarding)/step-2-reality",
  3: "/(onboarding)/step-3-shift",
  4: "/(onboarding)/step-4-goal",
  5: "/(onboarding)/step-5-apps",
  6: "/(onboarding)/step-6-permissions",
  7: "/(onboarding)/step-7-paywall",
};

/**
 * Routes the user to the correct screen after a successful sign-in.
 * Reads state directly from Zustand (no hooks — safe to call outside React).
 */
export function routeAfterAuth() {
  const { isOnboardingComplete, currentStep } = useOnboardingStore.getState();
  const { isSubscribed } = useUserStore.getState();

  if (!isOnboardingComplete) {
    const route = STEP_ROUTES[currentStep] ?? "/(onboarding)/step-1-hook";
    router.replace(route as any);
  } else if (!isSubscribed) {
    router.replace("/(onboarding)/step-7-paywall" as any);
  } else {
    router.replace("/(tabs)" as any);
  }
}
