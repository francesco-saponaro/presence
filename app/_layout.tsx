import { toastConfig } from "@/components/toastConfig";
import i18n from "@/i18n";
import { routeAfterAuth } from "@/lib/authRouting";
import { initNotifications } from "@/lib/notifications";
import { isInRecovery, storePendingResetUrl } from "@/lib/recoveryState";
import {
  configurePurchases,
  identifyPurchasesUser,
  resetPurchasesUser,
} from "@/lib/purchases";
import { startShieldEngine } from "@/lib/shieldEngine";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { useUserStore } from "@/store/userStore";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
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

  // Restore the user's saved language preference on every cold start.
  useEffect(() => {
    const savedLang = useUserStore.getState().language;
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang);
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
        useUserStore
          .getState()
          .setUser(session.user.id, session.user.email ?? "");

        // Tie RevenueCat purchases to this Supabase user ID
        identifyPurchasesUser(session.user.id);
      }

      // SIGNED_IN covers email, Apple, and Google auth — route to the
      // correct screen based on onboarding / subscription state.
      // Skip routing if reset-password.tsx is handling a recovery flow
      // (calling setSession with a recovery token also fires SIGNED_IN).
      if (event === "SIGNED_IN" && !isInRecovery()) {
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
