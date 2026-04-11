import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";

export default function Step3Shift() {
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleNext() {
    setCurrentStep(4);
    router.push("/(onboarding)/step-4-goal");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 3 of 7 — The Paradigm Shift</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        Replace the habit.
      </Text>
      <Text style={{ color: "grey" }}>[Pitch copy + Onboarding Image 3 — Phase 4]</Text>
      <Button title="I'm ready → Continue" onPress={handleNext} />
    </View>
  );
}
