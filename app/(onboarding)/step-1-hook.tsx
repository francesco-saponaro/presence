import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const OPTIONS_KEYS = ["opt1", "opt2", "opt3", "opt4"] as const;

export default function Step1Hook() {
  const { t } = useTranslation();
  const setSurveyAnswer = useOnboardingStore((s) => s.setSurveyAnswer);
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const [selected, setSelected] = useState<string | null>(null);

  function handleSelect(key: string) {
    setSelected(key);
    setSurveyAnswer(key);
    setCurrentStep(2);
    router.push("/(onboarding)/step-2-reality");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      {/* Progress */}
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <View className="h-[22px]" />
        <View className="flex-1">
          <OnboardingProgress current={1} total={8} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero image */}
        <View className="w-full items-center mt-6 mb-8">
          <Image
            source={require("@/assets/images/onboarding-3.png")}
            style={{ width: "100%", height: 240 }}
            contentFit="contain"
          />
        </View>

        {/* Step label */}
        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step1.label")}
        </Text>

        {/* Headline */}
        <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center px-8 leading-snug mb-10">
          {t("onboarding.step1.question")}
        </Text>

        {/* Survey options */}
        <View className="px-6 gap-3">
          {OPTIONS_KEYS.map((key) => (
            <PillButton
              key={key}
              label={t(`onboarding.step1.${key}`)}
              variant="outline"
              selected={selected === key}
              onPress={() => handleSelect(key)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
