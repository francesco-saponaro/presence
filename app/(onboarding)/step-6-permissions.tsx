import { useState } from "react";
import { View, Text, Switch, ScrollView, Platform, Alert, TouchableOpacity } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as ImagePicker from "expo-image-picker";
import { useOnboardingStore } from "@/store/onboardingStore";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import {
  ScreenTimeModule,
  BlockerModule,
} from "@/lib/nativeModules";

type PermKey = "screenTime" | "notifications" | "activityTracking" | "photoLibrary";

const PERMISSIONS: { key: PermKey; icon: string }[] = [
  { key: "screenTime", icon: "⏱" },
  { key: "notifications", icon: "🔔" },
  { key: "activityTracking", icon: "📊" },
  { key: "photoLibrary", icon: "🖼" },
];

async function requestPermission(key: PermKey): Promise<boolean> {
  switch (key) {
    case "screenTime": {
      if (Platform.OS === "ios") {
        try {
          await ScreenTimeModule.requestAuthorization();
          return true;
        } catch {
          return false;
        }
      }
      if (Platform.OS === "android") {
        // Leads user to Android's Usage Access settings page
        await BlockerModule.openUsageAccessSettings();
        // We can't know immediately if they granted it — optimistically return true
        // The actual check happens at shield-activation time
        return true;
      }
      return false;
    }

    case "notifications": {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === "granted";
    }

    case "activityTracking": {
      if (Platform.OS === "android") {
        // Battery optimization must be disabled for the background blocker service
        await BlockerModule.openBatteryOptimizationSettings();
        return true;
      }
      // iOS: Activity Tracking (ATT) is not relevant for Presence — we don't use ad tracking.
      // We show this row for transparency but there's nothing to request.
      return true;
    }

    case "photoLibrary": {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return status === "granted";
    }

    default:
      return false;
  }
}

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
    if (!value) {
      // Toggling off — just update UI (user must go to Settings manually to revoke)
      setGranted((prev) => ({ ...prev, [key]: false }));
      return;
    }

    // Android-specific guidance before opening settings
    if (Platform.OS === "android" && key === "screenTime") {
      Alert.alert(
        "Usage Access",
        "On the next screen, find 'Presence' in the list and enable it.",
        [{ text: "OK", onPress: async () => {
          const ok = await requestPermission(key);
          setGranted((prev) => ({ ...prev, [key]: ok }));
        }}]
      );
      return;
    }

    if (Platform.OS === "android" && key === "activityTracking") {
      Alert.alert(
        "Battery Optimization",
        "On the next screen, tap 'Don't optimize' so Presence can run in the background.",
        [{ text: "OK", onPress: async () => {
          const ok = await requestPermission(key);
          setGranted((prev) => ({ ...prev, [key]: ok }));
        }}]
      );
      return;
    }

    const ok = await requestPermission(key);
    setGranted((prev) => ({ ...prev, [key]: ok }));
  }

  function handleBack() {
    setCurrentStep(5);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-5-apps");
  }

  function handleNext() {
    setCurrentStep(7);
    router.push("/(onboarding)/step-7-paywall");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={6} total={7} />
        </View>
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
                thumbColor="#FAF7F2"
                ios_backgroundColor="#C6C0B9"
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA — all 4 are optional; user can always proceed */}
      <View
        className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton label={t("common.continue")} variant="primary" onPress={handleNext} />
      </View>
    </SafeAreaView>
  );
}
