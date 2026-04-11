import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { useUserStore } from "@/store/userStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRoutineStore } from "@/store/routine";
import { useShieldStore } from "@/store/shield";
import { supabase } from "@/lib/supabase";

export default function ProfileScreen() {
  const email = useUserStore((s) => s.email);
  const isSubscribed = useUserStore((s) => s.isSubscribed);

  const setSession = useAuthStore((s) => s.setSession);
  const clearUser = useUserStore((s) => s.clearUser);
  const resetOnboarding = useOnboardingStore((s) => s.resetOnboarding);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    router.replace("/(auth)/login");
  }

  /** DEV: wipe all persisted state and restart the full flow */
  function handleDevReset() {
    setSession(null);
    clearUser();
    resetOnboarding();
    router.replace("/(auth)/login");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Profile</Text>
      <Text>Email: {email ?? "—"}</Text>
      <Text>Subscribed: {isSubscribed ? "Yes" : "No"}</Text>
      <Text style={{ color: "grey" }}>[Language, Routine, Blocked Apps, Feedback — Phase 5]</Text>
      <Button title="Log Out" onPress={handleLogout} />
      <Button title="[DEV] Reset all state → Login" onPress={handleDevReset} />
      <Text style={{ color: "grey", fontSize: 12 }}>Terms of Service · Privacy Policy</Text>
      <Text style={{ color: "grey", fontSize: 12 }}>Manage Subscription</Text>
      <Text style={{ color: "grey", fontSize: 11 }}>© 2026 Presence</Text>
    </View>
  );
}
