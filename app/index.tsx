import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { useOnboardingStore } from "@/store/onboardingStore";

/**
 * Routing brain. Waits for both persisted stores to finish hydrating
 * from AsyncStorage, then redirects to the correct screen.
 *
 * Decision tree:
 *   no session              → (auth)/login
 *   session + incomplete    → (onboarding)/step-{currentStep}
 *   session + complete      → (tabs)
 */
export default function Index() {
  const authHydrated = useAuthStore((s) => s._hasHydrated);
  const onboardingHydrated = useOnboardingStore((s) => s._hasHydrated);
  const session = useAuthStore((s) => s.session);
  const isOnboardingComplete = useOnboardingStore((s) => s.isOnboardingComplete);
  const currentStep = useOnboardingStore((s) => s.currentStep);

  const STEP_ROUTES: Record<number, string> = {
    1: "/(onboarding)/step-1-hook",
    2: "/(onboarding)/step-2-reality",
    3: "/(onboarding)/step-3-shift",
    4: "/(onboarding)/step-4-goal",
    5: "/(onboarding)/step-5-apps",
    6: "/(onboarding)/step-6-permissions",
    7: "/(onboarding)/step-7-paywall",
  };

  useEffect(() => {
    if (!authHydrated || !onboardingHydrated) return; // wait for AsyncStorage

    if (!session) {
      router.replace("/(auth)/login");
      return;
    }

    if (!isOnboardingComplete) {
      const route = STEP_ROUTES[currentStep] ?? "/(onboarding)/step-1-hook";
      router.replace(route as any);
      return;
    }

    router.replace("/(tabs)");
  }, [authHydrated, onboardingHydrated, session, isOnboardingComplete, currentStep]);

  // Render a neutral loading view while stores hydrate.
  // In Phase 5 this will be replaced by expo-splash-screen control.
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
