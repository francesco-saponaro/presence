import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useUserStore } from "@/store/userStore";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import {
  getAnnualPackage,
  purchasePackage,
  restorePurchases,
  extractEntitlement,
} from "@/lib/purchases";
import { supabase } from "@/lib/supabase";
import { syncRoutineToSupabase } from "@/lib/routineSync";

const TOS_URL = "https://gist.github.com/francesco-saponaro/8fc0b7c3e435c4880cca34b70526adf4";
const PRIVACY_URL = "https://gist.github.com/francesco-saponaro/8fc0b7c3e435c4880cca34b70526adf4";

const BENEFIT_KEYS = ["benefit1", "benefit2", "benefit3", "benefit4"] as const;

export default function Step7Paywall() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setSubscribed = useUserStore((s) => s.setSubscribed);

  function handleBack() {
    setCurrentStep(8);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-6-permissions");
  }

  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getAnnualPackage()
      .then(setPkg)
      .finally(() => setLoadingOffering(false));
  }, []);

  async function handlePurchaseSuccess(expiresAt: string | null) {
    setSubscribed(true, expiresAt);
    completeOnboarding();

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({
          is_subscribed: true,
          subscription_expires_at: expiresAt,
        })
        .eq("id", user.id);

      // Persist all routine data (block time, frequency, apps, contacts) collected
      // during onboarding to Supabase now that we have a confirmed user.
      syncRoutineToSupabase().catch(() => {});
    }

    router.replace("/(tabs)");
  }

  async function handleSubscribe() {
    if (!pkg) return;
    setPurchasing(true);
    try {
      const info = await purchasePackage(pkg);
      const { isActive, expiresAt } = extractEntitlement(info);
      if (isActive) {
        await handlePurchaseSuccess(expiresAt);
      } else {
        Alert.alert(
          "Purchase incomplete",
          "Your purchase was processed but we could not verify the entitlement. Please restore purchases or contact support."
        );
      }
    } catch (e: any) {
      if (e?.userCancelled) return;
      Alert.alert(
        "Purchase failed",
        e?.message ?? "Something went wrong. Please try again."
      );
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      const { isActive, expiresAt } = extractEntitlement(info);
      if (isActive) {
        await handlePurchaseSuccess(expiresAt);
      } else {
        Alert.alert(
          t("common.error"),
          "No active subscription found for this Apple / Google account."
        );
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("common.error"));
    } finally {
      setRestoring(false);
    }
  }

  const priceString = pkg?.product.priceString ?? t("onboarding.step7.price");
  const isLoading = purchasing || restoring;

  return (
    <SafeAreaView className="flex-1 bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={9} total={9} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero image */}
        <View className="w-full items-center mt-4 mb-5">
          <Image
            source={require("@/assets/images/onboarding-4.png")}
            style={{ width: "100%", height: 210 }}
            contentFit="contain"
          />
        </View>

        {/* Step label */}
        <Text className="font-sans-medium text-xs tracking-widest text-greige text-center uppercase mb-3">
          {t("onboarding.step7.label")}
        </Text>

        {/* Headline */}
        <Text className="font-serif-display text-4xl text-text-light text-center px-8 leading-snug mb-2">
          {t("onboarding.step7.title")}
        </Text>

        {/* Emotional subtext */}
        <Text className="font-sans-body text-sm text-greige text-center px-10 mb-7 leading-relaxed">
          {t("onboarding.step7.social")}
        </Text>

        {/* Benefits list */}
        <View className="mx-6 mb-6 gap-3">
          {BENEFIT_KEYS.map((key) => (
            <View key={key} className="flex-row items-start gap-3">
              <View className="w-5 h-5 rounded-full bg-tan items-center justify-center mt-0.5 shrink-0">
                <Ionicons name="checkmark" size={12} color="#261B10" />
              </View>
              <Text className="flex-1 font-sans-medium text-sm text-text-light leading-snug">
                {t(`onboarding.step7.${key}`)}
              </Text>
            </View>
          ))}
        </View>

        {/* Price card */}
        <View
          className="mx-6 rounded-3xl bg-surface-dark border border-brown-mid/60 px-6 py-7 items-center"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 8,
          }}
        >
          <Text className="font-sans-medium text-xs text-greige uppercase tracking-widest mb-3">
            {t("onboarding.step7.planLabel")}
          </Text>

          {loadingOffering ? (
            <ActivityIndicator color="#D6B588" style={{ marginVertical: 16 }} />
          ) : (
            <View className="flex-row items-end gap-1 mb-1">
              <Text className="font-serif-display text-5xl text-tan">
                {priceString}
              </Text>
              <Text className="font-sans-body text-base text-greige mb-2">
                {t("onboarding.step7.period")}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* CTAs */}
      <View
        className="px-6 pt-4 gap-3"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <PillButton
          label={isLoading && purchasing ? t("common.loading") : t("onboarding.step7.cta")}
          variant="secondary"
          onPress={handleSubscribe}
          disabled={isLoading || loadingOffering || !pkg}
        />

        <PillButton
          label={isLoading && restoring ? t("common.loading") : t("onboarding.step7.restore")}
          variant="ghost"
          onPress={handleRestore}
          disabled={isLoading}
        />

        <Text className="font-sans-body text-xs text-brown-mid text-center">
          {t("onboarding.step7.disclaimer")}
          {"  ·  "}
          <Text
            className="underline"
            onPress={() => Linking.openURL(TOS_URL)}
          >
            {t("onboarding.step7.terms")}
          </Text>
          {"  ·  "}
          <Text
            className="underline"
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            {t("onboarding.step7.privacy")}
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}
