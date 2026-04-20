import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    // step-1 locked (entry point, no previous step).
    // step-7-paywall locked (hard paywall, gesture disabled but back button present).
    // All other steps allow the back gesture so the user can revisit previous slides.
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="step-1-hook" />
      <Stack.Screen name="step-2-reality" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-3-shift" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-4-how" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-4-goal" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-6-contacts" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-5-apps" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-6-permissions" options={{ gestureEnabled: true }} />
      <Stack.Screen name="step-7-paywall" />
    </Stack>
  );
}
