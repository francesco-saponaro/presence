import { View, Text, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useUserStore } from "@/store/userStore";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";

export default function Step7Paywall() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const setSubscribed = useUserStore((s) => s.setSubscribed);

  function handleMockSubscribe() {
    // RevenueCat purchase wired in Phase 5.
    setSubscribed(true, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
    completeOnboarding();
    router.replace("/(tabs)");
  }

  return (
    <SafeAreaView className="flex-1 bg-espresso">
      {/* Paywall uses dark/gradient background per spec */}
      <View className="px-6 pt-4">
        <OnboardingProgress current={7} total={7} />
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero image */}
        <View className="w-full items-center mt-6 mb-6">
          <Image
            source={require("@/assets/images/onboarding-4.png")}
            style={{ width: "100%", height: 240 }}
            contentFit="contain"
          />
        </View>

        {/* Label */}
        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step7.label")}
        </Text>

        {/* Headline */}
        <Text className="font-serif-display text-4xl text-text-light text-center px-8 leading-snug mb-3">
          {t("onboarding.step7.title")}
        </Text>

        {/* Social proof */}
        <Text className="font-sans-body text-base text-greige text-center px-10 mb-10">
          {t("onboarding.step7.social")}
        </Text>

        {/* Price card */}
        <View
          className="mx-6 rounded-3xl bg-surface-dark border border-brown-mid/60 px-6 py-6 items-center"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 8,
          }}
        >
          <Text className="font-sans-medium text-sm text-greige uppercase tracking-widest mb-2">
            {t("onboarding.step7.planLabel")}
          </Text>
          <View className="flex-row items-end gap-1 mb-1">
            <Text className="font-serif-display text-5xl text-tan">
              {t("onboarding.step7.price")}
            </Text>
            <Text className="font-sans-body text-base text-greige mb-2">
              {t("onboarding.step7.period")}
            </Text>
          </View>
          <Text className="font-sans-medium text-xs text-brown-mid">
            {t("onboarding.step7.trial")}
          </Text>
        </View>
      </ScrollView>

      {/* CTAs */}
      <View
        className="px-6 pt-4 gap-3"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton
          label={t("onboarding.step7.cta")}
          variant="secondary"
          onPress={handleMockSubscribe}
        />

        <PillButton
          label={t("onboarding.step7.restore")}
          variant="ghost"
          onPress={() => {}}
        />

        <Text className="font-sans-body text-xs text-brown-mid text-center">
          {t("onboarding.step7.disclaimer")}
          {"  ·  "}
          <Text className="underline">{t("onboarding.step7.terms")}</Text>
          {"  ·  "}
          <Text className="underline">{t("onboarding.step7.privacy")}</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}
