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
import { PickerModule, ScreenTimeModule, countAppsInSelection } from "@/lib/nativeModules";
import { useShieldStore } from "@/store/shield";
import { syncRoutineToSupabase } from "@/lib/routineSync";
import { PillButton } from "@/components/ui/PillButton";
import { LockedWhileBlocked } from "@/components/ui/LockedWhileBlocked";
import Toast from "react-native-toast-message";

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
    setBlockedAppNames,
    setFamilyActivitySelection,
  } = useRoutineStore();

  // While the shield is active, editing blocked apps (e.g. deselecting them all)
  // would lift the block without verifying a connection. Lock until they connect.
  const isBlocked = useShieldStore((s) => s.isBlocked);
  // TEMP (pre-release testing): edit-lock disabled so blocked apps can be changed
  // while blocked. Set EDIT_LOCK_WHILE_BLOCKED back to true before release.
  const EDIT_LOCK_WHILE_BLOCKED = false;
  const showLock = isBlocked && EDIT_LOCK_WHILE_BLOCKED;

  // iOS: count of selected items derived from the persisted selection
  const [selectionCount, setSelectionCount] = useState(() =>
    countAppsInSelection(familyActivitySelection)
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
  // Apple does not expose bundle IDs from FamilyActivityPicker tokens (privacy
  // by design). We store the opaque FamilyActivitySelection for shielding and
  // display a count derived by parsing the token array in the base64 payload.

  async function openPicker() {
    setPickerLoading(true);
    try {
      const result = await PickerModule.show(familyActivitySelection);
      if (result) {
        const count = countAppsInSelection(result.selection);
        setSelectionCount(count);
        setFamilyActivitySelection(result.selection);
        // apps is always [] on iOS (Apple privacy) — clear bundle ID list
        setBlockedApps([]);
        setBlockedAppNames({});
        syncRoutineToSupabase().catch(() => {});

        // Re-apply (or clear) the native shield immediately so changes take
        // effect without needing an app reload.
        const { isBlocked, setBlocked } = useShieldStore.getState();
        if (isBlocked) {
          if (count > 0) {
            ScreenTimeModule.applyShieldFromSelection(result.selection).catch(console.warn);
          } else {
            // User deselected everything — lift the shield
            ScreenTimeModule.clearShield().catch(console.warn);
            setBlocked(false);
          }
        }

        Toast.show({ type: "success", text1: t("profile.appsSaved") });
      }
    } catch (e) {
      console.warn("[blocked-apps] picker error:", e);
      Toast.show({ type: "error", text1: "Could not open app picker" });
    } finally {
      setPickerLoading(false);
    }
  }

  // ── Android save ──────────────────────────────────────────────────────────

  async function handleAndroidSave() {
    setBlockedApps(
      ANDROID_APPS.filter((a) => selected.has(a.id)).map((a) => a.packageName)
    );
    syncRoutineToSupabase().catch(() => {});
    Toast.show({ type: "success", text1: t("profile.appsSaved") });
    router.back();
  }

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

      {showLock ? (
        <LockedWhileBlocked />
      ) : (
      <>
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
                {selectionCount > 0
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

          {selectionCount > 0 && (
            <View className="mt-4 flex-row items-center gap-2 px-1">
              <Ionicons name="checkmark-circle" size={16} color="#705E46" />
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige">
                {selectionCount} {selectionCount === 1 ? "app" : "apps"} selected
              </Text>
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

      {/* Bottom action */}
      <View
        className="px-6 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {Platform.OS === "ios" ? (
          <PillButton
            label={t("common.back")}
            variant="outline"
            onPress={() => router.back()}
          />
        ) : (
          <>
            {selected.size === 0 && (
              <Text className="font-sans-body text-xs text-greige text-center mb-3">
                {t("onboarding.step5.selectHint")}
              </Text>
            )}
            <PillButton
              label={t("common.save")}
              variant="primary"
              disabled={selected.size === 0}
              onPress={handleAndroidSave}
            />
          </>
        )}
      </View>
      </>
      )}
    </SafeAreaView>
  );
}
