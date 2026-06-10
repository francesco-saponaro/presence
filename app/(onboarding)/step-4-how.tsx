import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

interface HowStep {
  number: string;
  titleKey: string;
  descKey: string;
  /** Optional emphasised tagline below the description. Used on the Connect
   *  step to surface the AI personalised-prompts feature — it's the app's
   *  biggest differentiator and was previously buried in the desc string. */
  taglineKey?: string;
  icon: string;
}

const HOW_STEPS: HowStep[] = [
  {
    number: "1",
    titleKey: "step1Title",
    descKey: "step1Desc",
    icon: "lock-closed-outline",
  },
  {
    number: "2",
    titleKey: "step2Title",
    descKey: "step2Desc",
    taglineKey: "step2DescHighlight",
    icon: "chatbubble-ellipses-outline",
  },
  {
    number: "3",
    titleKey: "step3Title",
    descKey: "step3Desc",
    icon: "camera-outline",
  },
  {
    number: "4",
    titleKey: "step4Title",
    descKey: "step4Desc",
    icon: "lock-open-outline",
  },
];

export default function Step4How() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);

  function handleBack() {
    setCurrentStep(3);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-3-shift");
  }

  function handleNext() {
    setCurrentStep(5);
    router.push("/(onboarding)/step-4-goal");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={4} total={8} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Boilerplate hero image — replace with final asset */}
        <View className="w-full items-center mt-6 mb-8 overflow-hidden">
          <Image
            source={require("@/assets/images/onboarding-5.png")}
            style={{ width: "100%", height: 240, transform: [{ scale: 4 }] }}
            contentFit="contain"
          />
        </View>

        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step4how.label")}
        </Text>

        <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center px-8 leading-snug mb-2">
          {t("onboarding.step4how.title")}
        </Text>

        <Text className="font-sans-body text-sm text-brown-mid dark:text-greige text-center px-10 mb-7">
          {t("onboarding.step4how.subtitle")}
        </Text>

        {/* How-it-works step cards */}
        <View className="px-6 gap-4">
          {HOW_STEPS.map((step) => (
            <View
              key={step.number}
              className="bg-surface-light dark:bg-surface-dark rounded-3xl px-5 py-5 flex-row items-center gap-4 border border-greige/40 dark:border-brown-mid/40"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              {/* Numbered circle */}
              <View className="w-11 h-11 rounded-full bg-brown-dark dark:bg-tan items-center justify-center shrink-0">
                <Text className="font-serif-display text-xl text-text-light dark:text-espresso">
                  {step.number}
                </Text>
              </View>

              <View className="flex-1">
                <Text className="font-sans-bold text-sm text-text-dark dark:text-text-light mb-1">
                  {t(`onboarding.step4how.${step.titleKey}`)}
                </Text>
                <Text className="font-sans-body text-xs text-brown-mid dark:text-greige leading-snug">
                  {t(`onboarding.step4how.${step.descKey}`)}
                </Text>
                {step.taglineKey && (
                  // Icon rendered inline INSIDE the Text component so the
                  // tagline left-aligns with the description above (no
                  // flex-row indent). Ionicons is a font icon, so when
                  // nested in <Text> it renders as an inline glyph.
                  <Text className="font-sans-bold text-xs text-brown-dark dark:text-tan leading-snug mt-2">
                    <Ionicons name="sparkles" size={13} color="#705E46" />
                    {"  "}
                    {t(`onboarding.step4how.${step.taglineKey}`)}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Screenshot tip callout */}
        <View className="mx-6 mt-5 bg-tan/15 dark:bg-tan/10 rounded-2xl px-4 py-4 border border-tan/40">
          <Text className="font-sans-body text-xs text-brown-dark dark:text-tan text-center leading-relaxed">
            {t("onboarding.step4how.hint")}
          </Text>
        </View>
      </ScrollView>

      <View
        className="px-6 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton
          label={t("common.continue")}
          variant="primary"
          onPress={handleNext}
        />
      </View>
    </SafeAreaView>
  );
}
