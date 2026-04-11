import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useUserStore } from "@/store/userStore";

export default function Step7Paywall() {
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const setSubscribed = useUserStore((s) => s.setSubscribed);

  function handleMockSubscribe() {
    setSubscribed(true, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
    completeOnboarding();
    router.replace("/(tabs)");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 7 of 7 — Paywall</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        Start living presently.
      </Text>
      <Text style={{ color: "grey" }}>[Before/After graph + RevenueCat yearly plan — Phase 4]</Text>
      <Text style={{ color: "grey" }}>[Onboarding Image 4 — Phase 4]</Text>
      <Button title="[DEV] Mock Subscribe → Dashboard" onPress={handleMockSubscribe} />
      <Button title="Restore Purchases (placeholder)" onPress={() => {}} />
      <Text style={{ color: "grey", fontSize: 12 }}>Terms of Service · Privacy Policy</Text>
    </View>
  );
}
