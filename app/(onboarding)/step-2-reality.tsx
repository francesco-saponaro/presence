import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";

export default function Step2Reality() {
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleNext() {
    setCurrentStep(3);
    router.push("/(onboarding)/step-3-shift");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 2 of 7 — The Reality Check</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        You vs. the average person.
      </Text>
      <Text style={{ color: "grey" }}>[Data projection graph + Onboarding Image 2 — Phase 4]</Text>
      <Button title="Continue" onPress={handleNext} />
    </View>
  );
}
