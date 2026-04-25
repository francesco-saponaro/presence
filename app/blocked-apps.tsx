import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore } from "@/store/routine";
import { PickerModule, type PickerApp } from "@/lib/nativeModules";
import { syncRoutineToSupabase } from "@/lib/routineSync";
import { PillButton } from "@/components/ui/PillButton";
import Toast from "react-native-toast-message";

// Android list — same as onboarding
const ANDROID_APPS = [
  { id: "instagram",  name: "Instagram",   color: "#E1306C", packageName: "com.instagram.android" },
  { id: "tiktok",     name: "TikTok",      color: "#010101", packageName: "com.zhiliaoapp.musically" },
  { id: "twitter",    name: "X / Twitter", color: "#1DA1F2", packageName: "com.twitter.android" },
  { id: "youtube",    name: "YouTube",     color: "#FF0000", packageName: "com.google.android.youtube" },
  { id: "reddit",     name: "Reddit",      color: "#FF4500", packageName: "com.reddit.frontpage" },
  { id: "snapchat",   name: "Snapchat",    color: "#FFFC00", packageName: "com.snapchat.android" },
  { id: "facebook",   name: "Facebook",    color: "#1877F2", packageName: "com.facebook.katana" },
  { id: "threads",    name: "Threads",     color: "#101010", packageName: "com.instagram.barcelona" },
];

export default function BlockedAppsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const {
    blockedApps,
    familyActivitySelection,
    setBlockedApps,
    setFamilyActivitySelection,
  } = useRoutineStore();

  // iOS: track selected apps for display
  const [iosApps, setIosApps] = useState<PickerApp[]>(() =>
    blockedApps.map((bundleId) => ({ bundleId }))
  );
  const [pickerLoading, setPickerLoading] = useState(false);

  // Android: pre-fill from stored package names
  const [selected, setSelected] = useState<Set<string>>(() => {
    const stored = new Set<string>();
    ANDROID_APPS.forEach((a) => {
      if (blockedApps.includes(a.packageName)) stored.add(a.id);
    });
    return stored.size > 0 ? stored : new Set(["instagram", "tiktok"]);
  });

  function toggleApp(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── iOS picker ────────────────────────────────────────────────────────────

  async function openPicker() {
    setPickerLoading(true);
    try {
      const result = await PickerModule.show(familyActivitySelection);
      if (result) {
        setIosApps(result.apps);
        setFamilyActivitySelection(result.selection);
        setBlockedApps(result.apps.map((a) => a.bundleId));
      }
    } catch {
      Toast.show({ type: "error", text1: "Could not open app picker" });
    } finally {
      setPickerLoading(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (Platform.OS === "android") {
      setBlockedApps(
        ANDROID_APPS.filter((a) => selected.has(a.id)).map((a) => a.packageName)
      );
    }
    // iOS: already saved directly via openPicker → just sync and go back
    syncRoutineToSupabase().catch(() => {});
    Toast.show({ type: "success", text1: t("profile.appsSaved") });
    router.back();
  }

  const canSave =
    Platform.OS === "ios" ? iosApps.length > 0 : selected.size > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      {/* Header */}
      <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <Text className="flex-1 font-serif-display text-xl text-text-dark dark:text-text-light">
          {t("profile.blockedApps")}
        </Text>
      </View>
      <View className="h-px bg-greige/30 dark:bg-brown-mid/20 mx-6 mb-2" />

      {Platform.OS === "ios" ? (
        // ── iOS: FamilyActivityPicker ──────────────────────────────────────
        <View className="flex-1 px-6 pt-6">
          <TouchableOpacity
            onPress={openPicker}
            activeOpacity={0.7}
            disabled={pickerLoading}
            className="flex-row items-center justify-between bg-surface-light dark:bg-surface-dark rounded-2xl px-5 py-4 border border-greige/30"
          >
            <View className="flex-row items-center gap-3">
              <Ionicons name="apps-outline" size={22} color="#705E46" />
              <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                {iosApps.length > 0
                  ? t("onboarding.step5.changeApps")
                  : t("onboarding.step5.chooseApps")}
              </Text>
            </View>
            {pickerLoading ? (
              <ActivityIndicator size="small" color="#705E46" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#C6C0B9" />
            )}
          </TouchableOpacity>

          {iosApps.length > 0 && (
            <View className="mt-6">
              <Text className="font-sans-medium text-xs tracking-widest text-greige uppercase mb-3">
                {t("onboarding.step5.selectedApps")}
              </Text>
              {iosApps.map((app) => (
                <View
                  key={app.bundleId}
                  className="flex-row items-center py-3 border-b border-surface-light dark:border-surface-dark"
                >
                  <Ionicons name="checkmark-circle" size={18} color="#705E46" />
                  <Text className="ml-3 font-sans-body text-sm text-text-dark dark:text-text-light">
                    {app.name ?? app.bundleId}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        // ── Android: checkbox list ─────────────────────────────────────────
        <FlatList
          data={ANDROID_APPS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-surface-light dark:bg-surface-dark mx-1" />
          )}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                onPress={() => toggleApp(item.id)}
                activeOpacity={0.7}
                className="flex-row items-center py-4 gap-4"
              >
                <View
                  className="w-10 h-10 rounded-2xl"
                  style={{ backgroundColor: item.color }}
                />
                <Text className="flex-1 font-sans-medium text-base text-text-dark dark:text-text-light">
                  {item.name}
                </Text>
                <View
                  className={[
                    "w-6 h-6 rounded-full border-2 items-center justify-center",
                    isSelected
                      ? "bg-brown-dark border-brown-dark dark:bg-tan dark:border-tan"
                      : "bg-transparent border-greige",
                  ].join(" ")}
                >
                  {isSelected && (
                    <Text className="text-text-light dark:text-espresso text-xs font-sans-bold">✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Save */}
      <View
        className="px-6 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {!canSave && (
          <Text className="font-sans-body text-xs text-greige text-center mb-3">
            {t("onboarding.step5.selectHint")}
          </Text>
        )}
        <PillButton
          label={t("common.save")}
          variant="primary"
          disabled={!canSave}
          onPress={handleSave}
        />
      </View>
    </SafeAreaView>
  );
}
