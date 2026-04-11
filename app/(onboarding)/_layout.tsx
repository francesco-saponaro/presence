import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="step-1-hook" />
      <Stack.Screen name="step-2-reality" />
      <Stack.Screen name="step-3-shift" />
      <Stack.Screen name="step-4-goal" />
      <Stack.Screen name="step-5-apps" />
      <Stack.Screen name="step-6-permissions" />
      <Stack.Screen name="step-7-paywall" />
    </Stack>
  );
}
