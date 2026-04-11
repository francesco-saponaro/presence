import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRoutineStore } from "@/store/routine";

export default function Step5Apps() {
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setBlockedApps = useRoutineStore((s) => s.setBlockedApps);

  function handleNext() {
    setBlockedApps(["Instagram", "TikTok", "Twitter"]);
    setCurrentStep(6);
    router.push("/(onboarding)/step-6-permissions");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 5 of 7 — App Selection</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        Choose apps to block.
      </Text>
      <Text style={{ color: "grey" }}>[App list with checkboxes — Phase 4]</Text>
      <Button title="Select Instagram, TikTok, Twitter (default) → Continue" onPress={handleNext} />
    </View>
  );
}
