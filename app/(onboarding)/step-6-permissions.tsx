import { useState } from "react";
import { View, Text, Switch, ScrollView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/store/onboardingStore";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";

type PermKey = "screenTime" | "notifications" | "activityTracking" | "photoLibrary";

const PERMISSIONS: { key: PermKey; icon: string }[] = [
  { key: "screenTime", icon: "⏱" },
  { key: "notifications", icon: "🔔" },
  { key: "activityTracking", icon: "📊" },
  { key: "photoLibrary", icon: "🖼" },
];

export default function Step6Permissions() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  const [granted, setGranted] = useState<Record<PermKey, boolean>>({
    screenTime: false,
    notifications: false,
    activityTracking: false,
    photoLibrary: false,
  });

  async function handleToggle(key: PermKey, value: boolean) {
    // Native permission requests wired in Phase 6 (native modules).
    // For now, toggle the local state to demonstrate the UI.
    setGranted((prev) => ({ ...prev, [key]: value }));
  }

  function handleNext() {
    setCurrentStep(7);
    router.push("/(onboarding)/step-7-paywall");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4">
        <OnboardingProgress current={6} total={7} />
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-6 pt-6 pb-6">
          <Text className="font-sans-medium text-xs tracking-widest text-greige uppercase mb-2">
            {t("onboarding.step6.label")}
          </Text>
          <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light leading-snug mb-1">
            {t("onboarding.step6.title")}
          </Text>
          <Text className="font-sans-body text-sm text-brown-mid dark:text-greige">
            {t("onboarding.step6.subtitle")}
          </Text>
        </View>

        {/* Permission rows */}
        <View className="px-6 gap-3">
          {PERMISSIONS.map(({ key, icon }) => (
            <View
              key={key}
              className="bg-surface-light dark:bg-surface-dark rounded-3xl px-5 py-5 flex-row items-center gap-4 border border-greige/40 dark:border-brown-mid/40"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              {/* Icon */}
              <View className="w-11 h-11 rounded-2xl bg-milk dark:bg-espresso items-center justify-center">
                <Text style={{ fontSize: 22 }}>{icon}</Text>
              </View>

              {/* Text */}
              <View className="flex-1 mr-2">
                <Text className="font-sans-bold text-sm text-text-dark dark:text-text-light">
                  {t(`onboarding.step6.${key}`)}
                </Text>
                <Text className="font-sans-body text-xs text-brown-mid dark:text-greige mt-0.5 leading-snug">
                  {t(`onboarding.step6.${key}Desc`)}
                </Text>
              </View>

              {/* Toggle */}
              <Switch
                value={granted[key]}
                onValueChange={(v) => handleToggle(key, v)}
                trackColor={{ false: "#C6C0B9", true: "#705E46" }}
                thumbColor={granted[key] ? "#FAF7F2" : "#FAF7F2"}
                ios_backgroundColor="#C6C0B9"
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA — all 4 are optional, user can always skip */}
      <View
        className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton label={t("common.continue")} variant="primary" onPress={handleNext} />
      </View>
    </SafeAreaView>
  );
}
