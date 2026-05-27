import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { PillButton } from "@/components/ui/PillButton";

/**
 * Shown on the Schedule and Blocked-apps settings pages while the shield is
 * active. Editing the routine while blocked would let the user lift the shield
 * without verifying a connection (a cheat), so configuration is locked until
 * they connect. The CTA routes to the home tab where they upload proof.
 */
export function LockedWhileBlocked() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 px-6 items-center justify-center">
      <View className="w-20 h-20 rounded-full bg-surface-light dark:bg-surface-dark items-center justify-center mb-8 border border-greige dark:border-brown-mid">
        <Ionicons name="lock-closed-outline" size={36} color="#705E46" />
      </View>
      <Text className="font-serif-display text-2xl text-text-dark dark:text-text-light text-center mb-3">
        {t("blockTime.lockedTitle")}
      </Text>
      <Text className="font-sans-body text-sm text-greige text-center leading-5 mb-8">
        {t("blockTime.lockedBody")}
      </Text>
      <View className="w-full">
        <PillButton
          label={t("blockTime.lockedCta")}
          variant="primary"
          onPress={() => router.replace("/(tabs)" as any)}
        />
      </View>
    </View>
  );
}
