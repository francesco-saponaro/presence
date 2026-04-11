import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useUserStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useUserStore((s) => s.setUser);
  const isOnboardingComplete = useOnboardingStore((s) => s.isOnboardingComplete);

  /** DEV: simulate a successful login without real Supabase credentials */
  function handleMockLogin() {
    // Provide a minimal mock so the store has a truthy session
    setSession({ access_token: "mock", user: { id: "mock-user", email: "dev@presence.app" } } as any);
    setUser("mock-user", "dev@presence.app");
    if (isOnboardingComplete) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(onboarding)/step-1-hook");
    }
  }

  async function handleSupabaseLogin() {
    // Real implementation placeholder — wired up in Phase 3
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Login</Text>
      <Text style={{ color: "grey" }}>[Email + Password fields — Phase 3]</Text>
      <Button title="[DEV] Mock Sign In → Onboarding" onPress={handleMockLogin} />
      <Button title="Go to Sign Up" onPress={() => router.push("/(auth)/signup")} />
      <Button title="Forgot Password" onPress={() => router.push("/(auth)/forgot-password")} />
    </View>
  );
}
