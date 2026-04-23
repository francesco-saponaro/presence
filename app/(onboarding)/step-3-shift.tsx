import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Step3Shift() {
  const { t } = useTranslation();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleBack() {
    setCurrentStep(2);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-2-reality");
  }

  function handleNext() {
    setCurrentStep(4);
    router.push("/(onboarding)/step-4-how");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={3} total={9} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full items-center mt-6 mb-8">
          <Image
            source={require("@/assets/images/onboarding-3.png")}
            style={{ width: "100%", height: 240 }}
            contentFit="contain"
          />
        </View>

        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-4">
          {t("onboarding.step3.label")}
        </Text>

        {/* Large, dominant headline */}
        <Text className="font-serif-display text-4xl text-text-dark dark:text-text-light text-center px-6 leading-tight mb-6">
          {t("onboarding.step3.headline")}
        </Text>

        {/* Separator accent */}
        <View className="self-center w-12 h-1 rounded-full bg-tan mb-6" />

        <Text className="font-sans-medium text-lg text-brown-mid dark:text-greige text-center px-8 mb-5 leading-snug">
          {t("onboarding.step3.subhead")}
        </Text>

        <Text className="font-sans-body text-base text-brown-mid dark:text-greige text-center px-10 leading-relaxed">
          {t("onboarding.step3.body")}
        </Text>
      </ScrollView>

      <View className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark">
        <PillButton
          label={t("common.continue")}
          variant="primary"
          onPress={handleNext}
        />
      </View>
    </SafeAreaView>
  );
}
