import { toastConfig } from "@/components/toastConfig";
import i18n from "@/i18n";
import { routeAfterAuth } from "@/lib/authRouting";
import { initNotifications } from "@/lib/notifications";
import {
  checkEntitlement,
  configurePurchases,
  identifyPurchasesUser,
  resetPurchasesUser,
} from "@/lib/purchases";
import { isInRecovery, storePendingResetUrl } from "@/lib/recoveryState";
import { startShieldEngine } from "@/lib/shieldEngine";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useUserStore } from "@/store/userStore";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import "../global.css";
import "../i18n";

SplashScreen.preventAutoHideAsync();

// Configure RevenueCat once at module load (before any component mounts)
configurePurchases();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "DMSerifDisplay-Regular": DMSerifDisplay_400Regular,
    "DMSans-Regular": DMSans_400Regular,
    "DMSans-Medium": DMSans_500Medium,
    "DMSans-Bold": DMSans_700Bold,
  });

  // useEffect(() => {
  //   const nukeSession = async () => {
  //     // ⚠️ TEMPORARY: Instantly log out on app start
  //     await supabase.auth.signOut();
  //     console.log("💣 Session Nuked!");
  //   };
  //   nukeSession();
  // }, []);

  // Capture password-reset deep-link URLs as early as possible — before Expo
  // Router finishes navigation — so reset-password.tsx can always read them
  // from recoveryState even if Linking.useURL() returns null on that screen.
  useEffect(() => {
    const capture = (url: string | null) => {
      if (!url) return;
      console.log("[_layout] Linking URL captured:", url);
      if (url.includes("reset-password") && url.includes("#")) {
        storePendingResetUrl(url);
      }
    };
    Linking.getInitialURL().then(capture);
    const sub = Linking.addEventListener("url", ({ url }) => capture(url));
    return () => sub.remove();
  }, []);

  // Restore language on cold start.
  // Only override the device-detected default if the user explicitly picked a language.
  useEffect(() => {
    const { language, languageSetByUser } = useUserStore.getState();
    if (languageSetByUser && language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, []);

  // Start the shield engine once on mount (AppState listener + schedule check).
  useEffect(() => {
    const stop = startShieldEngine();
    return stop;
  }, []);

  // Initialize notifications once on mount (sets handler + schedules warm-up).
  useEffect(() => {
    initNotifications();
  }, []);

  // Keep Zustand session store in sync with Supabase for the entire app lifetime.
  // Also identifies / de-identifies the RevenueCat user on auth state change.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY is handled entirely inside reset-password.tsx.
      // Propagating it here would cause index.tsx to re-route the user
      // away from the reset screen mid-flow.
      if (event === "PASSWORD_RECOVERY") return;

      useAuthStore.getState().setSession(session);

      if (session?.user) {
        const incomingId = session.user.id;
        const storedId = useUserStore.getState().userId;

        // Detect a brand-new signup: account created within the last 2 minutes.
        // This is the most reliable signal — it fires even when storedId is null
        // (e.g. user deleted their Supabase account, SIGNED_OUT cleared userId,
        // then they re-registered on the same device).
        const createdMs = session.user.created_at
          ? new Date(session.user.created_at).getTime()
          : 0;
        const isNewAccount = Date.now() - createdMs < 120_000;

        // Also reset if a different *existing* account signs in on this device
        // (storedId non-null and doesn't match the incoming session).
        const isDifferentUser = storedId !== null && storedId !== incomingId;

        if (isNewAccount || isDifferentUser) {
          useOnboardingStore.getState().resetOnboarding();
          useUserStore.getState().clearUser();
          // Explicitly wipe subscription for a fresh account — clearUser() keeps
          // isSubscribed intact for same-user re-logins.
          useUserStore.getState().setSubscribed(false, null);
        }

        useUserStore.getState().setUser(incomingId, session.user.email ?? "");

        // Re-identify with RevenueCat, then restore subscription if RC confirms
        // it's active. We intentionally do NOT set false here — revocation is
        // handled by the server-side webhook. The client check is a positive
        // signal only (restores state after reinstall / account switch).
        identifyPurchasesUser(incomingId).then(() =>
          checkEntitlement().then(({ isActive, expiresAt }) => {
            if (isActive)
              useUserStore.getState().setSubscribed(true, expiresAt);
          }),
        );
      }

      // SIGNED_IN covers email, Apple, and Google auth — route to the
      // correct screen based on onboarding / subscription state.
      // Skip routing if reset-password.tsx is handling a recovery flow
      // (calling setSession with a recovery token also fires SIGNED_IN).
      if (event === "SIGNED_IN" && !isInRecovery()) {
        console.log("[_layout] SIGNED_IN routing — store state:", {
          isOnboardingComplete:
            useOnboardingStore.getState().isOnboardingComplete,
          currentStep: useOnboardingStore.getState().currentStep,
          isSubscribed: useUserStore.getState().isSubscribed,
          userId: useUserStore.getState().userId,
        });
        routeAfterAuth();
      }

      if (event === "SIGNED_OUT") {
        useUserStore.getState().clearUser();
        resetPurchasesUser();
        router.replace("/(auth)/login" as any);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset-password" />
          </Stack>
          <StatusBar style="auto" />
          <Toast config={toastConfig} />
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

// eas build --profile production --platform ios --auto-submit
// eas build --platform ios --profile development
