import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/store/onboardingStore";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";

export default function Step3Shift() {
  const { t } = useTranslation();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleNext() {
    setCurrentStep(4);
    router.push("/(onboarding)/step-4-goal");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4">
        <OnboardingProgress current={3} total={7} />
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full items-center mt-6 mb-8">
          <Image
            source={require("@/assets/images/onboarding-3.png")}
            style={{ width: "100%", height: 260 }}
            contentFit="contain"
          />
        </View>

        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step3.label")}
        </Text>

        <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center px-8 leading-snug mb-4">
          {t("onboarding.step3.headline")}
        </Text>

        <Text className="font-sans-medium text-lg text-brown-mid text-center px-8 mb-4">
          {t("onboarding.step3.subhead")}
        </Text>

        <Text className="font-sans-body text-base text-brown-mid dark:text-greige text-center px-10 leading-relaxed">
          {t("onboarding.step3.body")}
        </Text>
      </ScrollView>

      <View className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark">
        <PillButton label={t("common.continue")} variant="primary" onPress={handleNext} />
      </View>
    </SafeAreaView>
  );
}
