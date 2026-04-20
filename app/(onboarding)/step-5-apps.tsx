import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRoutineStore } from "@/store/routine";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";

const ALL_APPS = [
  {
    id: "instagram", name: "Instagram", color: "#E1306C",
    bundleId: "com.burbn.instagram", packageName: "com.instagram.android",
  },
  {
    id: "tiktok", name: "TikTok", color: "#010101",
    bundleId: "com.zhiliaoapp.musically", packageName: "com.zhiliaoapp.musically",
  },
  {
    id: "twitter", name: "X / Twitter", color: "#1DA1F2",
    bundleId: "com.atebits.Tweetie2", packageName: "com.twitter.android",
  },
  {
    id: "youtube", name: "YouTube", color: "#FF0000",
    bundleId: "com.google.ios.youtube", packageName: "com.google.android.youtube",
  },
  {
    id: "reddit", name: "Reddit", color: "#FF4500",
    bundleId: "com.reddit.Reddit", packageName: "com.reddit.frontpage",
  },
  {
    id: "snapchat", name: "Snapchat", color: "#FFFC00",
    bundleId: "com.toyopagroup.picaboo", packageName: "com.snapchat.android",
  },
  {
    id: "facebook", name: "Facebook", color: "#1877F2",
    bundleId: "com.facebook.Facebook", packageName: "com.facebook.katana",
  },
  {
    id: "threads", name: "Threads", color: "#101010",
    bundleId: "com.burbn.barcelona", packageName: "com.instagram.barcelona",
  },
];

export default function Step5Apps() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setBlockedApps = useRoutineStore((s) => s.setBlockedApps);
  const [selected, setSelected] = useState<Set<string>>(new Set(["instagram", "tiktok"]));

  function toggleApp(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleBack() {
    setCurrentStep(6);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-6-contacts");
  }

  function handleNext() {
    setBlockedApps(
      ALL_APPS.filter((a) => selected.has(a.id)).map((a) =>
        Platform.OS === "ios" ? a.bundleId : a.packageName
      )
    );
    setCurrentStep(8);
    router.push("/(onboarding)/step-6-permissions");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={7} total={9} />
        </View>
      </View>

      {/* Header */}
      <View className="px-6 pt-6 pb-4">
        <Text className="font-sans-medium text-xs tracking-widest text-greige uppercase mb-2">
          {t("onboarding.step5.label")}
        </Text>
        <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light leading-snug mb-1">
          {t("onboarding.step5.title")}
        </Text>
        <Text className="font-sans-body text-sm text-brown-mid dark:text-greige">
          {t("onboarding.step5.subtitle")}
        </Text>
      </View>

      {/* App list */}
      <FlatList
        data={ALL_APPS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-surface-light dark:bg-surface-dark mx-1" />
        )}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.id);
          return (
            <TouchableOpacity
              onPress={() => toggleApp(item.id)}
              activeOpacity={0.7}
              className="flex-row items-center py-4 gap-4"
            >
              {/* App colour dot */}
              <View
                className="w-10 h-10 rounded-2xl"
                style={{ backgroundColor: item.color }}
              />
              <Text className="flex-1 font-sans-medium text-base text-text-dark dark:text-text-light">
                {item.name}
              </Text>
              {/* Checkbox */}
              <View
                className={[
                  "w-6 h-6 rounded-full border-2 items-center justify-center",
                  isSelected
                    ? "bg-brown-dark border-brown-dark dark:bg-tan dark:border-tan"
                    : "bg-transparent border-greige",
                ].join(" ")}
              >
                {isSelected && (
                  <Text className="text-text-light dark:text-espresso text-xs font-sans-bold">
                    ✓
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* CTA */}
      <View
        className="px-6 pb-8 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {selected.size === 0 && (
          <Text className="font-sans-body text-xs text-greige text-center mb-3">
            {t("onboarding.step5.selectHint")}
          </Text>
        )}
        <PillButton
          label={t("common.continue")}
          variant="primary"
          disabled={selected.size === 0}
          onPress={handleNext}
        />
      </View>
    </SafeAreaView>
  );
}
