import "../global.css";
import "../i18n";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Toast from "react-native-toast-message";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display";
import { toastConfig } from "@/components/toastConfig";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { useUserStore } from "@/store/userStore";
import { startShieldEngine } from "@/lib/shieldEngine";
import {
  configurePurchases,
  identifyPurchasesUser,
  resetPurchasesUser,
} from "@/lib/purchases";
import { initNotifications } from "@/lib/notifications";
import i18n from "@/i18n";

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
      useAuthStore.getState().setSession(session);

      if (session?.user) {
        useUserStore.getState().setUser(
          session.user.id,
          session.user.email ?? ""
        );

        // Tie RevenueCat purchases to this Supabase user ID
        identifyPurchasesUser(session.user.id);
      }

      if (event === "SIGNED_OUT") {
        useUserStore.getState().clearUser();
        resetPurchasesUser();
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
