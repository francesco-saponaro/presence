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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "DMSerifDisplay-Regular": DMSerifDisplay_400Regular,
    "DMSans-Regular": DMSans_400Regular,
    "DMSans-Medium": DMSans_500Medium,
    "DMSans-Bold": DMSans_700Bold,
  });

  // Start the shield engine once on mount (AppState listener + schedule check).
  useEffect(() => {
    const stop = startShieldEngine();
    return stop;
  }, []);

  // Wire up the Supabase auth listener immediately — do NOT wait for fonts.
  // This keeps the Zustand session store in sync with Supabase for the entire
  // app lifetime: initial session restore, token refresh, sign-out, OAuth, etc.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Use getState() to avoid stale closure over store values.
        useAuthStore.getState().setSession(session);

        if (session?.user) {
          useUserStore.getState().setUser(
            session.user.id,
            session.user.email ?? ""
          );
        }

        if (event === "SIGNED_OUT") {
          useUserStore.getState().clearUser();
        }
      }
    );

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
