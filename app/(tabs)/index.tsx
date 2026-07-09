import LogoPng from "@/assets/images/logo-app.png";
import { PillButton } from "@/components/ui/PillButton";
import { runOCRValidation } from "@/lib/ocr";
import {
  checkAndUpdateShield,
  onConnectionVerified,
  syncPendingConnections,
} from "@/lib/shieldEngine";
import { assignChallengeIfNeeded } from "@/lib/blockChallenge";
import { supabase } from "@/lib/supabase";
import { formatBlockTime, formatCountdown } from "@/lib/timezone";
import { useContactsStore } from "@/store/contacts";
import { useRoutineStore } from "@/store/routine";
import { useShieldStore } from "@/store/shield";
import { useUserStore } from "@/store/userStore";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import * as StoreReview from "expo-store-review";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

/** Max age of a screenshot accepted as proof, in hours. Read from the iOS
 *  Photos library's PHAsset.creationDate, so a fresh screenshot of an old
 *  conversation taken today still passes (intentional — the user did just
 *  take it). The strict name-match gate is the actual anti-cheat layer; this
 *  bounds how stale the visual evidence is. */
const MAX_SCREENSHOT_AGE_HOURS = 6;

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const isBlocked = useShieldStore((s) => s.isBlocked);
  const ocrFailCount = useShieldStore((s) => s.ocrFailCount);
  const incrementOcrFail = useShieldStore((s) => s.incrementOcrFail);
  const activeChallenge = useShieldStore((s) => s.activeChallenge);

  const blockTimeUtc = useRoutineStore((s) => s.blockTimeUtc);
  const frequency = useRoutineStore((s) => s.frequency);
  const contacts = useContactsStore((s) => s.contacts);

  const connections = useUserStore((s) => s.lifetimeSuccessfulConnections);
  const streak = useUserStore((s) => s.currentStreak);
  const achievementsEarned = useUserStore((s) => s.achievementsEarned);
  const lastAckAchievement = useUserStore((s) => s.lastAckAchievement);
  const acknowledgeAchievement = useUserStore((s) => s.acknowledgeAchievement);

  const setStats = useUserStore((s) => s.setStats);

  const [isVerifying, setIsVerifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Re-evaluate shield schedule and sync any pending offline connections
      await Promise.all([checkAndUpdateShield(), syncPendingConnections()]);

      // Re-fetch profile stats from Supabase so multi-device values are reflected
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from("profiles")
          .select("lifetime_connections, current_streak")
          .eq("id", session.user.id)
          .single();
        if (data) {
          setStats(data.lifetime_connections, data.current_streak);
        }
      }

      // Recalculate countdown immediately rather than waiting for the next tick
      if (blockTimeUtc) setCountdown(formatCountdown(blockTimeUtc));
    } catch {
      // Silently swallow — the UI already shows the latest local state
    } finally {
      setIsRefreshing(false);
    }
  }, [blockTimeUtc, setStats]);

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

  // On-demand challenge assignment: if the user enters blocked state and no
  // challenge is set (edge case — extension didn't get a chance to run, or a
  // legacy block from before this feature landed), assign one now. This is a
  // safety net; the warm-up notification bake time is the primary trigger.
  useEffect(() => {
    if (!isBlocked || activeChallenge) return;
    if (contacts.length === 0) return;
    assignChallengeIfNeeded().catch((e) =>
      __DEV__ && console.warn("[home] assignChallengeIfNeeded:", e),
    );
  }, [isBlocked, activeChallenge, contacts.length]);

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

    const asset = result.assets[0];
    const uri = asset.uri;

    // Strict recency gate: read the screenshot's creation time from the iOS
    // Photos library (PHAsset.creationDate). Rejects screenshots older than
    // MAX_SCREENSHOT_AGE_HOURS without running OCR. Works only on iOS where
    // assetId is populated; Android skips the check gracefully (different
    // photo library API; we can revisit if Android testing surfaces the need).
    // Falls open on any error so we don't block a legitimate upload because
    // of a metadata API hiccup.
    if (asset.assetId) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
        const creationMs = info?.creationTime;
        if (typeof creationMs === "number" && creationMs > 0) {
          const ageHours = (Date.now() - creationMs) / (1000 * 60 * 60);
          if (__DEV__) console.log("[OCR] screenshot age (hours):", ageHours.toFixed(2));
          if (ageHours > MAX_SCREENSHOT_AGE_HOURS) {
            incrementOcrFail();
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Toast.show({
              type: "error",
              text1: t("shield.failureTooOldTitle"),
              text2: t("shield.failureTooOldBody"),
              visibilityTime: 5000,
            });
            return;
          }
        }
      } catch (err) {
        if (__DEV__) console.warn("[OCR] getAssetInfoAsync failed:", err);
        // Fall open — OCR pipeline still runs.
      }
    }

    setIsVerifying(true);

    const validation = await runOCRValidation(uri, contacts, activeChallenge);
    setIsVerifying(false);

    if (validation.valid) {
      await onConnectionVerified(false, {
        contactId: validation.matchedContactId ?? null,
        themeId: validation.matchedThemeId ?? null,
        challengeWord: validation.matchedChallengeWord ?? null,
      });
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
      // Tailored copy per failure reason — generic "couldn't verify" is too
      // opaque when the user could fix it with a more specific tip.
      let title = t("shield.failure");
      let body: string | undefined = __DEV__
        ? `reason=${validation.reason ?? "unknown"}`
        : undefined;
      let visibility = __DEV__ ? 6000 : 3000;

      if (validation.reason === "no_contact_name") {
        title = t("shield.failureNoContactTitle");
        body = validation.requiredContactName
          ? t("shield.failureNoContactNamedBody", { name: validation.requiredContactName })
          : t("shield.failureNoContactBody");
        visibility = 5500;
      } else if (validation.reason === "no_challenge_word") {
        title = t("shield.failureNoWordTitle");
        body = t("shield.failureNoWordBody", { word: validation.requiredChallengeWord ?? "" });
        visibility = 6000;
      }

      Toast.show({
        type: "error",
        text1: title,
        text2: body,
        visibilityTime: visibility,
      });
    }
  }

  async function handleBypass() {
    Alert.alert(t("shield.bypass"), t("shield.bypassConfirm"), [
      { text: t("common.back"), style: "cancel" },
      {
        text: t("shield.bypass"),
        style: "destructive",
        onPress: async () => {
          await onConnectionVerified(true);
          Toast.show({ type: "info", text1: t("shield.bypassConfirm") });
        },
      },
    ]);
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const hasRoutine = !!blockTimeUtc && !!frequency;
  const blockTimeLabel = blockTimeUtc ? formatBlockTime(blockTimeUtc) : null;
  const showBypass = isBlocked && ocrFailCount >= 2 && !isVerifying;

  // The highest milestone the user has earned but not dismissed. When set, the
  // Home achievement banner surfaces once (per new milestone) until dismissed.
  const pendingAchievement = achievementsEarned.reduce<number>(
    (top, m) => (m > lastAckAchievement && m > top ? m : top),
    0,
  );

  // Prompt idea to show inside the challenge card. The theme text lives in
  // placeholder form ("ask {name} about ...") — swap in the real name.
  const challengePromptText = activeChallenge?.themeText
    ? activeChallenge.themeText.replace(/\{name\}/gi, activeChallenge.contactName)
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#705E46"
            colors={["#705E46"]}
          />
        }
      >
        <View
          className="flex-1 px-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {/* ── Logo ── */}
          <View className="items-center mt-6 mb-8ok">
            <Image
              source={LogoPng}
              style={{ width: 240, height: 80 }}
              contentFit="cover"
            />
            <Text className="font-serif-display text-lg text-brown-mid dark:text-tan text-center mb-10 tracking-widest uppercase">
              Presence
            </Text>
          </View>

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
                  isBlocked
                    ? "text-text-light dark:text-espresso"
                    : "text-greige",
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

          {/* ── Achievement banner (when a new milestone hasn't been dismissed) ── */}
          {pendingAchievement > 0 && (
            <View
              className="bg-tan dark:bg-tan/90 rounded-3xl p-5 mb-6 border border-brown-dark/20"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
                elevation: 4,
              }}
            >
              <View className="flex-row items-center mb-2">
                <Ionicons name="trophy" size={18} color="#422701" />
                <Text className="font-sans-medium text-xs text-brown-dark uppercase tracking-wider ml-2">
                  {t("home.achievementBannerLabel")}
                </Text>
              </View>
              <Text className="font-serif-display text-2xl text-espresso leading-tight mb-1">
                {t("home.achievementBannerTitle", { count: pendingAchievement })}
              </Text>
              <Text className="font-sans-body text-sm text-brown-dark leading-relaxed mb-4">
                {t("home.achievementBannerBody")}
              </Text>
              <TouchableOpacity
                onPress={() => acknowledgeAchievement(pendingAchievement)}
                activeOpacity={0.7}
                className="self-start bg-espresso rounded-full px-5 py-2"
              >
                <Text className="font-sans-medium text-sm text-milk">
                  {t("home.achievementBannerCta")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Challenge card (blocked + active challenge) ── */}
          {isBlocked && activeChallenge && (
            <View
              className="bg-surface-light dark:bg-surface-dark rounded-3xl p-6 mb-6 border border-tan dark:border-brown-mid"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.1,
                shadowRadius: 16,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center mb-3">
                <Ionicons name="flame" size={16} color="#705E46" />
                <Text className="font-sans-medium text-xs text-brown-mid dark:text-tan uppercase tracking-wider ml-2">
                  {t("home.challengeTitle")}
                </Text>
              </View>

              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige leading-relaxed">
                {t("home.challengeReachOut")}
              </Text>
              <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light leading-tight mt-1 mb-4">
                {activeChallenge.contactName}
              </Text>

              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige leading-relaxed mb-2">
                {t("home.challengeIncludeWord")}
              </Text>
              <View className="self-start bg-brown-dark dark:bg-tan rounded-2xl px-5 py-3 mb-3">
                <Text className="font-serif-display text-2xl text-milk dark:text-espresso tracking-wide">
                  {activeChallenge.word}
                </Text>
              </View>
              <Text className="font-sans-body text-xs text-greige dark:text-brown-mid leading-relaxed mb-4">
                {t("home.challengeCaptionExact")}
              </Text>

              {challengePromptText && (
                <View className="border-t border-greige/40 dark:border-brown-mid/40 pt-4">
                  <Text className="font-sans-medium text-xs text-brown-mid dark:text-tan uppercase tracking-wider mb-1">
                    {t("home.challengePromptLabel")}
                  </Text>
                  <Text className="font-sans-body text-sm italic text-text-dark dark:text-text-light leading-relaxed">
                    “{challengePromptText}”
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Stale-prompts nudge (challenge fell back to a re-used word) ── */}
          {isBlocked && activeChallenge?.themesStale && (
            <View className="bg-milk dark:bg-espresso rounded-3xl p-5 mb-6 border border-tan dark:border-brown-mid">
              <Text className="font-serif-display text-lg text-text-dark dark:text-text-light leading-tight mb-2">
                {t("home.stalePromptsTitle")}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige leading-relaxed mb-4">
                {t("home.stalePromptsBody", { name: activeChallenge.contactName })}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/contacts" as any)}
                activeOpacity={0.7}
                className="self-start bg-brown-dark dark:bg-tan rounded-full px-5 py-2"
              >
                <Text className="font-sans-medium text-sm text-milk dark:text-espresso">
                  {t("home.stalePromptsEdit")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── No-contacts setup card ── */}
          {contacts.length === 0 && (
            <View
              className="bg-tan/30 dark:bg-brown-mid/30 rounded-3xl p-6 mb-8 border border-tan dark:border-brown-mid"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.1,
                shadowRadius: 16,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center mb-4">
                <View className="w-12 h-12 rounded-full bg-brown-dark dark:bg-tan items-center justify-center mr-4">
                  <Ionicons
                    name="person-add"
                    size={22}
                    color="#FDFBF7"
                  />
                </View>
                <Text className="font-serif-display text-2xl text-text-dark dark:text-text-light flex-1 leading-tight">
                  {t("home.noContactsTitle")}
                </Text>
              </View>
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige leading-relaxed mb-5">
                {t("home.noContactsBody")}
              </Text>
              <PillButton
                label={t("home.noContactsCta")}
                variant="primary"
                onPress={() => router.push("/contacts" as any)}
              />
            </View>
          )}

          {/* ── CTA area (only when blocked) ── */}
          {isBlocked && (
            <View className="gap-3">
              <PillButton
                label={isVerifying ? t("home.uploading") : t("home.upload")}
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
            <View className="flex-row justify-around">
              {/* Genuine connections */}
              <View className="items-center gap-1">
                <Text className="font-serif-display text-4xl text-brown-dark dark:text-tan">
                  {connections}
                </Text>
                <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-wider text-center">
                  {t("home.connectionsLabel")}
                </Text>
              </View>

              {/* Vertical divider */}
              <View className="w-px bg-greige/40 dark:bg-brown-mid/30" />

              {/* Day streak */}
              <View className="items-center gap-1">
                <Text className="font-serif-display text-4xl text-brown-dark dark:text-tan">
                  {streak}
                </Text>
                <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-wider text-center">
                  {t("home.streakLabel")}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
