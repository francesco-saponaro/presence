import { View, Text, Button } from "react-native";
import { router } from "expo-router";
import { useOnboardingStore } from "@/store/onboardingStore";

export default function Step1Hook() {
  const setSurveyAnswer = useOnboardingStore((s) => s.setSurveyAnswer);
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleNext(answer: string) {
    setSurveyAnswer(answer);
    setCurrentStep(2);
    router.push("/(onboarding)/step-2-reality");
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 12, color: "grey" }}>Step 1 of 7 — The Hook</Text>
      <Text style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", paddingHorizontal: 24 }}>
        How does sending memes make you feel?
      </Text>
      <Text style={{ color: "grey" }}>[Survey options + Onboarding Image 1 — Phase 4]</Text>
      <Button title="Disconnected → Continue" onPress={() => handleNext("disconnected")} />
      <Button title="Numb → Continue" onPress={() => handleNext("numb")} />
      <Button title="Happy → Continue" onPress={() => handleNext("happy")} />
    </View>
  );
}
