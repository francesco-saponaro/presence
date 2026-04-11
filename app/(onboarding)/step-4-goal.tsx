import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRoutineStore } from "@/store/routine";

export default function Step4Goal() {
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setFrequency = useRoutineStore((s) => s.setFrequency);
  const setBlockTime = useRoutineStore((s) => s.setBlockTime);

  function handleNext() {
    // Defaults — real picker wired in Phase 4
    setBlockTime(new Date().toISOString());
    setFrequency("daily");
    setCurrentStep(5);
    router.push("/(onboarding)/step-5-apps");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 4 of 7 — Goal Setting</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        Set your block time.
      </Text>
      <Text style={{ color: "grey" }}>[DateTimePicker in Bottom Sheet + Frequency selector — Phase 4]</Text>
      <Button title="Set 8:00 PM Daily (default) → Continue" onPress={handleNext} />
    </View>
  );
}
