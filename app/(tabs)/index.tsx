import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as StoreReview from "expo-store-review";
import { useShieldStore } from "@/store/shield";
import { useRoutineStore } from "@/store/routine";
import { useUserStore } from "@/store/userStore";
import { isBlockTimeActive, formatBlockTime, formatCountdown } from "@/lib/timezone";
import { runOCRValidation } from "@/lib/ocr";
import { onConnectionVerified } from "@/lib/shieldEngine";
import { PillButton } from "@/components/ui/PillButton";

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const isBlocked = useShieldStore((s) => s.isBlocked);
  const ocrFailCount = useShieldStore((s) => s.ocrFailCount);
  const incrementOcrFail = useShieldStore((s) => s.incrementOcrFail);

  const blockTimeUtc = useRoutineStore((s) => s.blockTimeUtc);
  const frequency = useRoutineStore((s) => s.frequency);
  const trustedContacts = useRoutineStore((s) => s.trustedContacts);

  const connections = useUserStore((s) => s.lifetimeSuccessfulConnections);

  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  // Live countdown ticker
  useEffect(() => {
    if (!blockTimeUtc || isBlocked) return;
    const tick = () => {
      setCountdown(formatCountdown(blockTimeUtc));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [blockTimeUtc, isBlocked]);

  // ── OCR flow ───────────────────────────────────────────────────────────────

  async function handleUploadProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.show({ type: "info", text1: t("home.permissionNeeded") });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setIsVerifying(true);

    const validation = await runOCRValidation(uri, trustedContacts);
    setIsVerifying(false);

    if (validation.valid) {
      await onConnectionVerified(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: "success", text1: t("shield.success") });

      // App Store rating prompt on exactly the 3rd lifetime connection
      const total = useUserStore.getState().lifetimeSuccessfulConnections;
      if (total === 3 && (await StoreReview.hasAction())) {
        StoreReview.requestReview();
      }
    } else {
      incrementOcrFail();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Toast.show({ type: "error", text1: t("shield.failure") });
    }
  }

  async function handleBypass() {
    Alert.alert(
      t("shield.bypass"),
      t("shield.bypassConfirm"),
      [
        { text: t("common.back"), style: "cancel" },
        {
          text: t("shield.bypass"),
          style: "destructive",
          onPress: async () => {
            await onConnectionVerified(true);
            Toast.show({ type: "info", text1: t("shield.bypassConfirm") });
          },
        },
      ]
    );
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const hasRoutine = !!blockTimeUtc && !!frequency;
  const blockTimeLabel = blockTimeUtc ? formatBlockTime(blockTimeUtc) : null;
  const showBypass = isBlocked && ocrFailCount >= 2 && !isVerifying;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="flex-1 px-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {/* ── Wordmark ── */}
          <Text className="font-serif-display text-lg text-brown-mid dark:text-tan text-center mt-6 mb-12 tracking-widest uppercase">
            Presence
          </Text>

          {/* ── Main status card ── */}
          <View
            className="bg-surface-light dark:bg-surface-dark rounded-3xl p-8 items-center mb-8 border border-greige dark:border-brown-mid"
            style={{
              shadowColor: "#422701",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.08,
              shadowRadius: 20,
              elevation: 4,
            }}
          >
            {/* Status circle */}
            <View
              className={[
                "w-20 h-20 rounded-full items-center justify-center mb-6",
                isBlocked
                  ? "bg-brown-dark dark:bg-tan"
                  : "bg-surface-light dark:bg-surface-dark border-2 border-greige dark:border-brown-mid",
              ].join(" ")}
            >
              <Text
                className={[
                  "text-3xl",
                  isBlocked ? "text-text-light dark:text-espresso" : "text-greige",
                ].join(" ")}
              >
                {isBlocked ? "⬛" : "○"}
              </Text>
            </View>

            {/* Status headline */}
            <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center leading-snug mb-2">
              {isBlocked ? t("home.blocked") : t("home.unblocked")}
            </Text>

            {/* Sub-line */}
            <Text className="font-sans-body text-sm text-brown-mid dark:text-greige text-center leading-relaxed px-4">
              {isBlocked
                ? t("shield.title")
                : hasRoutine && countdown
                ? t("home.unblockedSub", { time: countdown })
                : t("home.noRoutine")}
            </Text>

            {/* Block time label */}
            {hasRoutine && blockTimeLabel && (
              <View className="mt-4 bg-greige/20 dark:bg-brown-mid/20 rounded-full px-4 py-1.5">
                <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-wider">
                  {t("home.blockTime", { time: blockTimeLabel })}
                </Text>
              </View>
            )}
          </View>

          {/* ── CTA area (only when blocked) ── */}
          {isBlocked && (
            <View className="gap-3">
              <PillButton
                label={
                  isVerifying
                    ? t("home.uploading")
                    : t("home.upload")
                }
                variant="primary"
                disabled={isVerifying}
                onPress={handleUploadProof}
              />

              {isVerifying && (
                <ActivityIndicator
                  size="small"
                  color="#705E46"
                  className="mt-2"
                />
              )}

              {showBypass && (
                <TouchableOpacity
                  onPress={handleBypass}
                  activeOpacity={0.6}
                  className="items-center py-3"
                >
                  <Text className="font-sans-body text-sm text-greige dark:text-brown-mid underline">
                    {t("shield.bypass")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Stats footer ── */}
          <View className="mt-auto pt-12">
            <View className="h-px bg-greige/40 dark:bg-brown-mid/30 mb-6" />
            <View className="flex-row justify-center items-baseline gap-2">
              <Text className="font-serif-display text-3xl text-brown-dark dark:text-tan">
                {connections}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige">
                {t("home.connectionsLabel")}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
