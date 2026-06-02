import { useCallback, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useRoutineStore } from "@/store/routine";
import { useShieldStore } from "@/store/shield";
import { getLocalBlockTime } from "@/lib/timezone";
import { syncRoutineToSupabase } from "@/lib/routineSync";
import { checkAndUpdateShield, deactivateSchedule } from "@/lib/shieldEngine";
import { scheduleWarmupNotification } from "@/lib/notifications";
import { PillButton } from "@/components/ui/PillButton";
import { LockedWhileBlocked } from "@/components/ui/LockedWhileBlocked";
import Toast from "react-native-toast-message";

type Frequency = "daily" | "5x" | "weekends";

const FREQ_KEYS: { key: Frequency; i18n: string }[] = [
  { key: "daily",    i18n: "onboarding.step4.daily" },
  { key: "5x",       i18n: "onboarding.step4.fiveX" },
  { key: "weekends", i18n: "onboarding.step4.weekends" },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Re-hydrate a stored UTC ISO string into a local Date for the picker. */
function storedToDate(blockTimeUtc: string | null): Date {
  const d = new Date();
  if (blockTimeUtc) {
    const { hour, minute } = getLocalBlockTime(blockTimeUtc);
    d.setHours(hour, minute, 0, 0);
  } else {
    d.setHours(20, 0, 0, 0); // default 8:00 PM
  }
  return d;
}

export default function BlockTimeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);

  const { blockTimeUtc, frequency: storedFrequency, setBlockTime, setFrequency } =
    useRoutineStore();

  const initial = storedToDate(blockTimeUtc);
  const [selectedTime, setSelectedTime] = useState<Date>(initial);
  const [pendingTime, setPendingTime] = useState<Date>(initial);
  const [frequency, setFrequencyLocal] = useState<Frequency>(
    (storedFrequency as Frequency) ?? "daily"
  );

  // When no schedule exists yet, show a friendly empty state with a single
  // "Set a schedule" button instead of the time picker. Tapping it reveals the
  // timer layout. An existing schedule always shows the timer layout directly.
  const hasSchedule = !!blockTimeUtc;
  const [isSettingUp, setIsSettingUp] = useState(false);
  const showTimer = hasSchedule || isSettingUp;

  // While the shield is active, editing the schedule would let the user lift the
  // block without verifying a connection. Lock the page until they connect.
  const isBlocked = useShieldStore((s) => s.isBlocked);
  // TEMP (pre-release testing): edit-lock disabled so the schedule can be changed /
  // removed while blocked. Set EDIT_LOCK_WHILE_BLOCKED back to true before release.
  const EDIT_LOCK_WHILE_BLOCKED = false;
  const showLock = isBlocked && EDIT_LOCK_WHILE_BLOCKED;

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  function handleConfirmTime() {
    setSelectedTime(pendingTime);
    sheetRef.current?.dismiss();
  }

  function scheduleStartToast(time: Date) {
    const now = new Date();
    const todayAtTime = new Date();
    todayAtTime.setHours(time.getHours(), time.getMinutes(), 0, 0);
    const minutesUntilToday = (todayAtTime.getTime() - now.getTime()) / (1000 * 60);
    const timeStr = formatTime(time);

    // Three cases:
    //   1. Today's instance is still in the future and ≥20 min away → fires today.
    //   2. Today's instance is in the future but <20 min away → DeviceActivity
    //      needs lead time, so it slips to tomorrow (show the warning).
    //   3. Today's instance is already past → next occurrence is tomorrow
    //      naturally (no warning, no urgency).
    if (minutesUntilToday >= 20) {
      Toast.show({
        type: "success",
        text1: t("profile.scheduleSaved"),
        text2: t("blockTime.startsToday", { time: timeStr }),
        visibilityTime: 5000,
      });
    } else if (minutesUntilToday > 0) {
      Toast.show({
        type: "prominent",
        text1: t("profile.scheduleSaved"),
        text2: t("blockTime.startsTomorrowSoon", { time: timeStr }),
        visibilityTime: 10000,
        position: "top",
      });
    } else {
      Toast.show({
        type: "success",
        text1: t("profile.scheduleSaved"),
        text2: t("blockTime.startsTomorrow", { time: timeStr }),
        visibilityTime: 5000,
      });
    }
  }

  async function handleSave() {
    const utc = selectedTime.toISOString();
    setBlockTime(utc);
    setFrequency(frequency);
    syncRoutineToSupabase().catch(() => {});
    // Re-schedule the frequency-aware warm-up reminders for the new time/frequency
    // (no-op if notifications were denied; never prompts post-onboarding).
    scheduleWarmupNotification(utc, frequency).catch(() => {});
    scheduleStartToast(selectedTime);
    router.back();
    // Re-evaluate the shield immediately so the homepage status and the native
    // shield update right away — e.g. moving the block time into the future
    // while currently blocked lifts the shield without waiting for a foreground
    // event or a manual refresh. checkAndUpdateShield() also performs the live
    // Screen Time auth re-prompt (replacing the old ensureScreenTimeAuth call).
    checkAndUpdateShield().catch(console.warn);
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      {/* Header */}
      <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <Text className="flex-1 font-serif-display text-xl text-text-dark dark:text-text-light">
          {t("profile.scheduleTitle")}
        </Text>
      </View>
      <View className="h-px bg-greige/30 dark:bg-brown-mid/20 mx-6 mb-2" />

      {showLock ? (
        <LockedWhileBlocked />
      ) : (
      <>
      <View className="flex-1 px-6 justify-center">
        {showTimer ? (
          <>
            <Text className="font-sans-body text-sm text-greige text-center mb-10">
              {t("onboarding.step4.subtitle")}
            </Text>

            {/* Time card */}
            <TouchableOpacity
              onPress={() => {
                setPendingTime(selectedTime);
                sheetRef.current?.present();
              }}
              activeOpacity={0.8}
              className="self-center mb-10"
            >
              <View
                className="bg-surface-light dark:bg-surface-dark rounded-3xl px-10 py-6 items-center border border-greige dark:border-brown-mid"
                style={{
                  shadowColor: "#422701",
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.08,
                  shadowRadius: 16,
                  elevation: 4,
                }}
              >
                <Text className="font-serif-display text-6xl text-brown-dark dark:text-tan tracking-tight">
                  {formatTime(selectedTime)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Frequency */}
            <Text className="font-sans-medium text-sm text-brown-mid dark:text-greige text-center mb-4">
              {t("onboarding.step4.frequencyLabel")}
            </Text>
            <View className="gap-3">
              {FREQ_KEYS.map(({ key, i18n }) => (
                <PillButton
                  key={key}
                  label={t(i18n)}
                  variant="outline"
                  selected={frequency === key}
                  onPress={() => setFrequencyLocal(key)}
                />
              ))}
            </View>
          </>
        ) : (
          /* Empty state — no schedule set yet */
          <View className="items-center">
            <View className="w-20 h-20 rounded-full bg-surface-light dark:bg-surface-dark items-center justify-center mb-8 border border-greige dark:border-brown-mid">
              <Ionicons name="alarm-outline" size={38} color="#705E46" />
            </View>
            <Text className="font-serif-display text-2xl text-text-dark dark:text-text-light text-center mb-3">
              {t("blockTime.noScheduleTitle")}
            </Text>
            <Text className="font-sans-body text-sm text-greige text-center leading-5">
              {t("blockTime.noScheduleBody")}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View
        className="px-6 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {showTimer ? (
          <>
            <PillButton label={t("common.save")} variant="primary" onPress={handleSave} />
            {hasSchedule && (
              <TouchableOpacity
                onPress={async () => {
                  await deactivateSchedule();
                  Toast.show({ type: "success", text1: t("blockTime.scheduleRemoved") });
                  router.back();
                }}
                activeOpacity={0.6}
                className="mt-4 items-center py-2"
              >
                <Text className="font-sans-body text-sm text-greige dark:text-greige">
                  {t("blockTime.removeSchedule")}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <PillButton
            label={t("blockTime.setSchedule")}
            variant="primary"
            onPress={() => setIsSettingUp(true)}
          />
        )}
      </View>

      {/* Time picker sheet */}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["45%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#EBE6DF" }}
        handleIndicatorStyle={{ backgroundColor: "#C6C0B9" }}
      >
        <BottomSheetView style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="font-serif-display text-xl text-text-dark">
              {t("onboarding.step4.sheetTitle")}
            </Text>
            <TouchableOpacity onPress={handleConfirmTime} activeOpacity={0.7}>
              <Text className="font-sans-bold text-base text-brown-dark">
                {t("onboarding.step4.sheetConfirm")}
              </Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pendingTime}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "spinner"}
            onChange={(_, date) => { if (date) setPendingTime(date); }}
            style={{ flex: 1 }}
            themeVariant="light"
          />
        </BottomSheetView>
      </BottomSheetModal>
      </>
      )}
    </SafeAreaView>
  );
}
