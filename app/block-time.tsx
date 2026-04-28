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
import { getLocalBlockTime } from "@/lib/timezone";
import { syncRoutineToSupabase } from "@/lib/routineSync";
import { ensureScreenTimeAuth, deactivateSchedule } from "@/lib/shieldEngine";
import { PillButton } from "@/components/ui/PillButton";
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
    const minutesUntil = (todayAtTime.getTime() - now.getTime()) / (1000 * 60);
    const timeStr = formatTime(time);

    if (minutesUntil >= 20) {
      Toast.show({
        type: "success",
        text1: t("profile.scheduleSaved"),
        text2: t("blockTime.startsToday", { time: timeStr }),
        visibilityTime: 5000,
      });
    } else {
      Toast.show({
        type: "info",
        text1: t("profile.scheduleSaved"),
        text2: t("blockTime.startsTomorrow", { time: timeStr }),
        visibilityTime: 8000,
        position: "top",
      });
    }
  }

  async function handleSave() {
    setBlockTime(selectedTime.toISOString());
    setFrequency(frequency);
    syncRoutineToSupabase().catch(() => {});
    scheduleStartToast(selectedTime);
    router.back();
    // Fire-and-forget: re-prompt for Screen Time auth if needed (iOS only)
    ensureScreenTimeAuth().catch(console.warn);
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

      <View className="flex-1 px-6 justify-center">
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
      </View>

      {/* Save + Remove */}
      <View
        className="px-6 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton label={t("common.save")} variant="primary" onPress={handleSave} />
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
    </SafeAreaView>
  );
}
