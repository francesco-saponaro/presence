import { useRef, useState, useCallback } from "react";
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
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRoutineStore } from "@/store/routine";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";

type Frequency = "daily" | "5x" | "weekends";

const FREQ_KEYS: { key: Frequency; i18n: string }[] = [
  { key: "daily", i18n: "onboarding.step4.daily" },
  { key: "5x", i18n: "onboarding.step4.fiveX" },
  { key: "weekends", i18n: "onboarding.step4.weekends" },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Step4Goal() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setFrequency = useRoutineStore((s) => s.setFrequency);
  const setBlockTime = useRoutineStore((s) => s.setBlockTime);

  // Default: 8:00 PM
  const defaultTime = new Date();
  defaultTime.setHours(20, 0, 0, 0);

  const [selectedTime, setSelectedTime] = useState<Date>(defaultTime);
  const [pendingTime, setPendingTime] = useState<Date>(defaultTime);
  const [frequency, setFrequencyLocal] = useState<Frequency>("daily");

  const sheetRef = useRef<BottomSheetModal>(null);

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

  function handleBack() {
    setCurrentStep(4);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-4-how");
  }

  function handleNext() {
    // Convert local time to UTC ISO string for storage
    setBlockTime(selectedTime.toISOString());
    setFrequency(frequency);
    setCurrentStep(6);
    router.push("/(onboarding)/step-6-contacts");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={5} total={9} />
        </View>
      </View>

      <View className="flex-1 px-6 justify-center">
        {/* Label */}
        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step4.label")}
        </Text>

        {/* Headline */}
        <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center leading-snug mb-2">
          {t("onboarding.step4.title")}
        </Text>
        <Text className="font-sans-body text-sm text-greige text-center mb-10">
          {t("onboarding.step4.subtitle")}
        </Text>

        {/* Time selector card */}
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

        {/* Frequency selector */}
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

      {/* CTA */}
      <View
        className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton label={t("common.continue")} variant="primary" onPress={handleNext} />
      </View>

      {/* Time Picker Bottom Sheet */}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["45%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#EBE6DF" }}
        handleIndicatorStyle={{ backgroundColor: "#C6C0B9" }}
      >
        <BottomSheetView style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}>
          {/* Sheet header */}
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

          {/* Native time picker */}
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
