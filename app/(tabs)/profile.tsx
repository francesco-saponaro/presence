import { useRef, useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import Constants from "expo-constants";
import Toast from "react-native-toast-message";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { useUserStore } from "@/store/userStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRoutineStore } from "@/store/routine";
import { formatBlockTime } from "@/lib/timezone";
import i18n from "@/i18n";

// ── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
] as const;

const SUBSCRIPTION_URL =
  Platform.OS === "ios"
    ? "itms-apps://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";

const TERMS_URL = "https://getpresenceapp.com/terms";
const PRIVACY_URL = "https://getpresenceapp.com/privacy";
const FEEDBACK_EMAIL = "mailto:hello@getpresenceapp.com";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  hideChevron?: boolean;
}

function Row({ icon, label, value, onPress, destructive, hideChevron }: RowProps) {
  const labelColor = destructive
    ? "text-red-400"
    : "text-text-dark dark:text-text-light";
  const iconColor = destructive ? "#f87171" : "#705E46";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      className="flex-row items-center py-4 px-5"
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text className={`flex-1 ml-3 font-sans-medium text-base ${labelColor}`}>
        {label}
      </Text>
      {value ? (
        <Text className="font-sans-body text-sm text-greige dark:text-brown-mid mr-2">
          {value}
        </Text>
      ) : null}
      {!hideChevron && (
        <Ionicons name="chevron-forward" size={15} color="#C6C0B9" />
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="font-sans-medium text-xs text-greige dark:text-brown-mid uppercase tracking-widest px-5 pt-6 pb-2">
      {title}
    </Text>
  );
}

function Divider() {
  return <View className="h-px bg-greige/30 dark:bg-brown-mid/20 mx-5" />;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="mx-6 bg-surface-light dark:bg-surface-dark rounded-2xl overflow-hidden border border-greige dark:border-brown-mid"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const email = useUserStore((s) => s.email);
  const language = useUserStore((s) => s.language);
  const setLanguage = useUserStore((s) => s.setLanguage);

  const blockTimeUtc = useRoutineStore((s) => s.blockTimeUtc);
  const frequency = useRoutineStore((s) => s.frequency);

  const langSheetRef = useRef<BottomSheetModal>(null);
  const feedbackSheetRef = useRef<BottomSheetModal>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const currentLangLabel =
    LANGUAGES.find((l) => l.code === language)?.label ?? "English";

  const blockTimeLabel = blockTimeUtc ? formatBlockTime(blockTimeUtc) : t("profile.notSet");
  const frequencyLabel = frequency
    ? t(`onboarding.step4.${frequency === "5x" ? "fiveX" : frequency}`)
    : t("profile.notSet");

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectLanguage(code: string) {
    setLanguage(code);
    i18n.changeLanguage(code);
    langSheetRef.current?.dismiss();
  }

  async function handleLogout() {
    Alert.alert(t("profile.logout"), t("profile.logoutConfirm"), [
      { text: t("common.back"), style: "cancel" },
      {
        text: t("profile.logout"),
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          useAuthStore.getState().setSession(null);
          useOnboardingStore.getState().resetOnboarding();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      t("profile.deleteConfirmTitle"),
      t("profile.deleteConfirmBody"),
      [
        { text: t("common.back"), style: "cancel" },
        {
          text: t("profile.deleteConfirmAction"),
          style: "destructive",
          onPress: async () => {
            // Calls a Supabase Edge Function that deletes the user via admin API.
            // The Edge Function "delete-account" is set up in Phase 7.
            const { error } = await supabase.functions.invoke("delete-account");
            if (error) {
              Toast.show({ type: "error", text1: t("common.error") });
              return;
            }
            await supabase.auth.signOut();
            useAuthStore.getState().setSession(null);
            useOnboardingStore.getState().resetOnboarding();
            useUserStore.getState().clearUser();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  }

  function openLink(url: string) {
    Linking.openURL(url).catch(() =>
      Toast.show({ type: "error", text1: t("common.error") })
    );
  }

  async function handleSendFeedback() {
    if (!feedbackMessage.trim()) return;
    const userEmail = useUserStore.getState().email ?? "";
    setSendingFeedback(true);
    try {
      const { error } = await supabase.functions.invoke("contact", {
        body: { email: userEmail, message: feedbackMessage.trim() },
      });
      if (error) throw error;
      feedbackSheetRef.current?.dismiss();
      setFeedbackMessage("");
      Toast.show({ type: "success", text1: "Sent. Thanks for reaching out." });
    } catch {
      Toast.show({ type: "error", text1: t("common.error") });
    } finally {
      setSendingFeedback(false);
    }
  }

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 32) }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View className="px-6 pt-6 pb-4">
          <Text className="font-serif-display text-lg text-brown-mid dark:text-tan tracking-widest uppercase text-center mb-1">
            Presence
          </Text>
          {email ? (
            <Text className="font-sans-body text-sm text-greige dark:text-brown-mid text-center">
              {email}
            </Text>
          ) : null}
        </View>
        <View className="h-px bg-greige/40 dark:bg-brown-mid/30 mx-6 mb-2" />

        {/* ── Routine ── */}
        <SectionHeader title={t("profile.sectionRoutine")} />
        <Card>
          <Row
            icon="time-outline"
            label={t("profile.manageRoutine")}
            value={blockTimeLabel}
            onPress={() => router.push("/(onboarding)/step-4-goal")}
          />
          <Divider />
          <Row
            icon="calendar-outline"
            label={t("profile.frequency")}
            value={frequencyLabel}
            onPress={() => router.push("/(onboarding)/step-4-goal")}
          />
          <Divider />
          <Row
            icon="apps-outline"
            label={t("profile.blockedApps")}
            onPress={() => router.push("/(onboarding)/step-5-apps")}
          />
        </Card>

        {/* ── Preferences ── */}
        <SectionHeader title={t("profile.sectionPreferences")} />
        <Card>
          <Row
            icon="language-outline"
            label={t("profile.language")}
            value={currentLangLabel}
            onPress={() => langSheetRef.current?.present()}
          />
        </Card>

        {/* ── Support ── */}
        <SectionHeader title={t("profile.sectionSupport")} />
        <Card>
          <Row
            icon="chatbubble-ellipses-outline"
            label={t("profile.feedback")}
            onPress={() => feedbackSheetRef.current?.present()}
          />
          <Divider />
          <Row
            icon="document-text-outline"
            label={t("profile.terms")}
            onPress={() => openLink(TERMS_URL)}
          />
          <Divider />
          <Row
            icon="shield-checkmark-outline"
            label={t("profile.privacy")}
            onPress={() => openLink(PRIVACY_URL)}
          />
        </Card>

        {/* ── Account ── */}
        <SectionHeader title={t("profile.sectionAccount")} />
        <Card>
          <Row
            icon="card-outline"
            label={t("profile.manageSubscription")}
            onPress={() => openLink(SUBSCRIPTION_URL)}
          />
          <Divider />
          <Row
            icon="log-out-outline"
            label={t("profile.logout")}
            onPress={handleLogout}
          />
          <Divider />
          <Row
            icon="trash-outline"
            label={t("profile.deleteAccount")}
            onPress={handleDeleteAccount}
            destructive
          />
        </Card>

        {/* ── Footer ── */}
        <View className="items-center mt-10 gap-1">
          <Text className="font-serif-display text-base text-greige dark:text-brown-mid tracking-widest uppercase">
            Presence
          </Text>
          <Text className="font-sans-body text-xs text-greige/60 dark:text-brown-mid/60">
            {t("profile.version", { version: APP_VERSION })}
          </Text>
          <Text className="font-sans-body text-xs text-greige/60 dark:text-brown-mid/60">
            {t("profile.copyright")}
          </Text>
        </View>
      </ScrollView>

      {/* ── Feedback bottom sheet ── */}
      <BottomSheetModal
        ref={feedbackSheetRef}
        snapPoints={["55%"]}
        enablePanDownToClose
        keyboardBehavior="extend"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#EBE6DF" }}
        handleIndicatorStyle={{ backgroundColor: "#C6C0B9" }}
      >
        <BottomSheetView style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}>
          <Text className="font-serif-display text-xl text-text-dark mb-1">
            {t("profile.feedback")}
          </Text>
          <Text className="font-sans-body text-sm text-greige mb-5">
            We read every message.
          </Text>
          <TextInput
            value={feedbackMessage}
            onChangeText={setFeedbackMessage}
            placeholder="What's on your mind?"
            placeholderTextColor="#C6C0B9"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={{
              backgroundColor: "#FAF7F2",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#C6C0B9",
              padding: 16,
              fontFamily: "DMSans-Regular",
              fontSize: 15,
              color: "#2A1800",
              minHeight: 120,
              marginBottom: 16,
            }}
          />
          <TouchableOpacity
            onPress={handleSendFeedback}
            disabled={sendingFeedback || !feedbackMessage.trim()}
            activeOpacity={0.8}
            style={{
              backgroundColor: "#422701",
              borderRadius: 100,
              paddingVertical: 16,
              alignItems: "center",
              opacity: sendingFeedback || !feedbackMessage.trim() ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: "DMSans-Medium", fontSize: 16, color: "#FDFBF7" }}>
              {sendingFeedback ? t("common.loading") : "Send"}
            </Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>

      {/* ── Language picker bottom sheet ── */}
      <BottomSheetModal
        ref={langSheetRef}
        snapPoints={["40%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#EBE6DF" }}
        handleIndicatorStyle={{ backgroundColor: "#C6C0B9" }}
      >
        <BottomSheetView style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}>
          <Text className="font-serif-display text-xl text-text-dark mb-4">
            {t("profile.langPickerTitle")}
          </Text>
          {LANGUAGES.map((lang, index) => (
            <View key={lang.code}>
              <TouchableOpacity
                onPress={() => handleSelectLanguage(lang.code)}
                activeOpacity={0.6}
                className="flex-row items-center py-3"
              >
                <Text className="flex-1 font-sans-medium text-base text-text-dark">
                  {lang.label}
                </Text>
                {language === lang.code && (
                  <Ionicons name="checkmark" size={20} color="#705E46" />
                )}
              </TouchableOpacity>
              {index < LANGUAGES.length - 1 && (
                <View className="h-px bg-greige/40" />
              )}
            </View>
          ))}
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
