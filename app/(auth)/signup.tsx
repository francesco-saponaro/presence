import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/auth";
import { useUserStore } from "@/store/userStore";

export default function SignupScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useUserStore((s) => s.setUser);

  function handleMockSignup() {
    setSession({ access_token: "mock", user: { id: "mock-user", email: "dev@presence.app" } } as any);
    setUser("mock-user", "dev@presence.app");
    router.replace("/(onboarding)/step-1-hook");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Create Account</Text>
      <Text style={{ color: "grey" }}>[Email + Password fields — Phase 3]</Text>
      <Text style={{ color: "grey", fontSize: 12, textAlign: "center", paddingHorizontal: 32 }}>
        By continuing you agree to our Terms of Service and Privacy Policy.
      </Text>
      <Button title="[DEV] Mock Sign Up → Onboarding" onPress={handleMockSignup} />
      <Button title="Back to Login" onPress={() => router.back()} />
    </View>
  );
}
