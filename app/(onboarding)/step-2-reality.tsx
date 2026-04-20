import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useOnboardingStore } from "@/store/onboardingStore";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";

const STATS = ["stat1", "stat2", "stat3"] as const;

export default function Step2Reality() {
  const { t } = useTranslation();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleBack() {
    setCurrentStep(1);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-1-hook");
  }

  function handleNext() {
    setCurrentStep(3);
    router.push("/(onboarding)/step-3-shift");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={2} total={9} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero image (the data graph) */}
        <View className="w-full items-center mt-6 mb-8">
          <Image
            source={require("@/assets/images/onboarding-2.png")}
            style={{ width: "100%", height: 240 }}
            contentFit="contain"
          />
        </View>

        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step2.label")}
        </Text>

        <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center px-8 leading-snug mb-3">
          {t("onboarding.step2.headline")}
        </Text>

        <Text className="font-sans-medium text-base text-brown-mid text-center px-8 mb-8">
          {t("onboarding.step2.subhead")}
        </Text>

        {/* Stat cards */}
        <View className="flex-row px-6 gap-3 mb-8">
          {STATS.map((key) => (
            <View
              key={key}
              className="flex-1 bg-surface-light dark:bg-surface-dark rounded-3xl px-3 py-5 items-center border border-greige/40 dark:border-brown-mid/40"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.07,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <Text className="font-serif-display text-4xl text-brown-dark dark:text-tan mb-1">
                {t(`onboarding.step2.${key}`)}
              </Text>
              <Text className="font-sans-body text-xs text-brown-mid dark:text-greige text-center leading-snug">
                {t(`onboarding.step2.${key}Label`)}
              </Text>
            </View>
          ))}
        </View>

        <Text className="font-sans-body text-sm text-brown-mid dark:text-greige text-center px-10 leading-relaxed">
          {t("onboarding.step2.body")}
        </Text>
      </ScrollView>

      <View className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark">
        <PillButton label={t("common.continue")} variant="primary" onPress={handleNext} />
      </View>
    </SafeAreaView>
  );
}
