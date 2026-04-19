import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, Alert, Linking, TouchableOpacity } from "react-native";
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

// Terms / Privacy URLs — update to real hosted pages before App Store submission
const TOS_URL = "https://presence.app/terms";
const PRIVACY_URL = "https://presence.app/privacy";

export default function Step7Paywall() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setSubscribed = useUserStore((s) => s.setSubscribed);

  function handleBack() {
    setCurrentStep(6);
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

  // Shared post-purchase flow
  async function handlePurchaseSuccess(expiresAt: string | null) {
    // Persist subscription state locally
    setSubscribed(true, expiresAt);
    completeOnboarding();

    // Optimistically update Supabase profile (webhook will also do this)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({
          is_subscribed: true,
          subscription_expires_at: expiresAt,
        })
        .eq("id", user.id);

      // Trigger welcome email (best-effort)
      supabase.functions
        .invoke("welcome-email", { body: { email: user.email } })
        .catch(() => {});
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
      // User cancelled — PurchasesErrorCode.purchaseCancelledError
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

  // Derived price / period strings from the RevenueCat package if available,
  // falling back to the i18n strings (which already have locale-specific prices)
  const priceString = pkg?.product.priceString ?? t("onboarding.step7.price");
  const periodString = t("onboarding.step7.period");

  const isLoading = purchasing || restoring;

  return (
    <SafeAreaView className="flex-1 bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={7} total={7} />
        </View>
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

        {/* Step label */}
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

          {loadingOffering ? (
            <ActivityIndicator color="#D6B588" style={{ marginVertical: 16 }} />
          ) : (
            <View className="flex-row items-end gap-1 mb-1">
              <Text className="font-serif-display text-5xl text-tan">
                {priceString}
              </Text>
              <Text className="font-sans-body text-base text-greige mb-2">
                {periodString}
              </Text>
            </View>
          )}

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
