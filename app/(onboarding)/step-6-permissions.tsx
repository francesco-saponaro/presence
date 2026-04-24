import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import { BlockerModule, ScreenTimeModule } from "@/lib/nativeModules";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

type PermKey =
  | "screenTime"
  | "notifications"
  | "activityTracking"
  | "photoLibrary";

// screenTime and photoLibrary are required to use Presence at all.
// notifications is strongly recommended but optional.
// activityTracking is optional (iOS: no-op; Android: battery optimisation).
const REQUIRED: PermKey[] = ["screenTime", "photoLibrary"];

const PERMISSIONS: { key: PermKey; icon: string }[] = [
  { key: "screenTime", icon: "⏱" },
  { key: "notifications", icon: "🔔" },
  { key: "activityTracking", icon: "📊" },
  { key: "photoLibrary", icon: "🖼" },
];

async function checkCurrentStatus(key: PermKey): Promise<boolean> {
  switch (key) {
    case "screenTime": {
      if (Platform.OS === "ios") {
        try {
          const status = await ScreenTimeModule.getAuthorizationStatus();
          return status === "approved";
        } catch {
          return false;
        }
      }
      if (Platform.OS === "android") {
        return BlockerModule.hasUsageStatsPermission();
      }
      return false;
    }
    case "notifications": {
      const { status } = await Notifications.getPermissionsAsync();
      return status === "granted";
    }
    case "activityTracking": {
      // iOS: no real ATT permission needed for Presence.
      // Android: no programmatic check for battery optimisation — treat as unknown/false until requested.
      return false;
    }
    case "photoLibrary": {
      const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
      return status === "granted";
    }
    default:
      return false;
  }
}

async function requestPermission(key: PermKey): Promise<boolean> {
  switch (key) {
    case "screenTime": {
      if (Platform.OS === "ios") {
        try {
          // Primary path: request authorization normally.
          await ScreenTimeModule.requestAuthorization();
          return true;
        } catch {
          // On iOS 16+, requestAuthorization throws when FamilyControls is
          // already authorized. Fall back to reading the real status.
          // getAuthorizationStatus is only available after the next EAS build
          // that includes the Swift implementation — until then it also throws
          // and we return false (no regression vs. before).
          try {
            const status = await ScreenTimeModule.getAuthorizationStatus();
            return status === "approved";
          } catch {
            return false;
          }
        }
      }
      if (Platform.OS === "android") {
        await BlockerModule.openUsageAccessSettings();
        // Can't synchronously verify — AppState listener will re-check on return.
        return false;
      }
      return false;
    }

    case "notifications": {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === "granted";
    }

    case "activityTracking": {
      if (Platform.OS === "android") {
        await BlockerModule.openBatteryOptimizationSettings();
        return true;
      }
      return true;
    }

    case "photoLibrary": {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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

  // Check what permissions are already granted so the UI reflects reality.
  const refreshPermissions = useCallback(async () => {
    const [screenTime, notifications, activityTracking, photoLibrary] =
      await Promise.all([
        checkCurrentStatus("screenTime"),
        checkCurrentStatus("notifications"),
        checkCurrentStatus("activityTracking"),
        checkCurrentStatus("photoLibrary"),
      ]);
    setGranted({ screenTime, notifications, activityTracking, photoLibrary });
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Re-check when user returns from OS settings (Android deep-links to settings pages).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissions();
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  async function handleToggle(key: PermKey, value: boolean) {
    if (!value) {
      if (REQUIRED.includes(key)) {
        // Required permissions can only be revoked in iOS/Android Settings.
        // Bounce the switch back to ON and explain why.
        Toast.show({
          type: "info",
          text1: t("onboarding.step6.requiredLockTitle"),
          text2: t("onboarding.step6.requiredLockBody"),
          visibilityTime: 3000,
        });
        return; // Switch stays ON — state not updated
      }
      // Optional permissions — reflect the toggle in UI only.
      setGranted((prev) => ({ ...prev, [key]: false }));
      return;
    }

    if (Platform.OS === "android" && key === "screenTime") {
      Alert.alert(
        t("onboarding.step6.androidUsageTitle"),
        t("onboarding.step6.androidUsageBody"),
        [
          {
            text: "OK",
            onPress: async () => {
              const ok = await requestPermission(key);
              setGranted((prev) => ({ ...prev, [key]: ok }));
            },
          },
        ],
      );
      return;
    }

    if (Platform.OS === "android" && key === "activityTracking") {
      Alert.alert(
        t("onboarding.step6.androidBatteryTitle"),
        t("onboarding.step6.androidBatteryBody"),
        [
          {
            text: "OK",
            onPress: async () => {
              const ok = await requestPermission(key);
              setGranted((prev) => ({ ...prev, [key]: ok }));
            },
          },
        ],
      );
      return;
    }

    const ok = await requestPermission(key);
    setGranted((prev) => ({ ...prev, [key]: ok }));
  }

  function handleBack() {
    setCurrentStep(7);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-5-apps");
  }

  function handleNext() {
    const missingRequired = REQUIRED.filter((k) => !granted[k]);

    // if (missingRequired.length > 0) {
    //   Toast.show({
    //     type: "error",
    //     text1: t("onboarding.step6.requiredErrorTitle"),
    //     text2: t("onboarding.step6.requiredErrorBody"),
    //     visibilityTime: 4000,
    //   });
    //   return;
    // }

    if (!granted.notifications) {
      // Soft warning — show toast but still navigate forward.
      Toast.show({
        type: "info",
        text1: t("onboarding.step6.notificationsWarningTitle"),
        text2: t("onboarding.step6.notificationsWarningBody"),
        visibilityTime: 3500,
      });
    }

    setCurrentStep(9);
    router.push("/(onboarding)/step-7-paywall");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={8} total={9} />
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
          {PERMISSIONS.map(({ key, icon }) => {
            const isRequired = REQUIRED.includes(key);
            const isRecommended = key === "notifications";
            return (
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
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="font-sans-bold text-sm text-text-dark dark:text-text-light">
                      {t(`onboarding.step6.${key}`)}
                    </Text>
                    {isRequired && (
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: "#422701" }}
                      >
                        <Text
                          className="font-sans-bold text-milk"
                          style={{ fontSize: 9, letterSpacing: 0.5 }}
                        >
                          {t("onboarding.step6.required").toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {isRecommended && (
                      <View className="rounded-full px-2 py-0.5 border border-greige/60">
                        <Text
                          className="font-sans-medium text-brown-mid dark:text-greige"
                          style={{ fontSize: 9, letterSpacing: 0.5 }}
                        >
                          {t("onboarding.step6.recommended").toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
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
            );
          })}
        </View>
      </ScrollView>

      <View
        className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton
          label={t("common.continue")}
          variant="primary"
          onPress={handleNext}
        />
      </View>
    </SafeAreaView>
  );
}
