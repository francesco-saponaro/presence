import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";

export default function Step6Permissions() {
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleNext() {
    setCurrentStep(7);
    router.push("/(onboarding)/step-7-paywall");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 6 of 7 — Permissions</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        Grant permissions.
      </Text>
      <Text style={{ color: "grey", textAlign: "center" }}>
        {"[1) Screen Time / Usage Access\n2) Notifications\n3) Activity Tracking\n4) Photo Library — Phase 4]"}
      </Text>
      <Button title="Grant all (mock) → Continue" onPress={handleNext} />
    </View>
  );
}
