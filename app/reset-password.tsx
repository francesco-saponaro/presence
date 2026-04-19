import { AuthInput } from "@/components/ui/AuthInput";
import { PillButton } from "@/components/ui/PillButton";
import {
  consumePendingResetUrl,
  setInRecovery,
} from "@/lib/recoveryState";
import { supabase } from "@/lib/supabase";
import { resetPasswordSchema, type ResetPasswordForm } from "@/lib/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // PKCE fallback: ?code= query param
  const { code } = useLocalSearchParams<{ code?: string }>();

  // Reactive deep-link URL (covers background-resume case)
  const deepLinkUrl = Linking.useURL();

  // Clear the recovery flag whenever this screen unmounts
  useEffect(() => {
    return () => setInRecovery(false);
  }, []);

  // Primary: try URL captured by _layout.tsx (most reliable — runs before
  // Expo Router finishes navigation). Falls back to Linking.useURL() and
  // then to Linking.getInitialURL().
  useEffect(() => {
    const tryUrls = async () => {
      const stored = consumePendingResetUrl();
      const initial = await Linking.getInitialURL();
      const reactive = deepLinkUrl;

      console.log("[reset-password] stored url:", stored);
      console.log("[reset-password] getInitialURL:", initial);
      console.log("[reset-password] useURL:", reactive);
      console.log("[reset-password] code param:", code);

      const url = stored ?? initial ?? reactive;
      if (url) handleUrl(url);
    };
    tryUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkUrl]);

  function handleUrl(url: string) {
    console.log("[reset-password] handleUrl:", url);
    const hashIndex = url.indexOf("#");
    if (hashIndex !== -1) {
      const params = new URLSearchParams(url.slice(hashIndex + 1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");
      console.log("[reset-password] hash tokens:", { accessToken: !!accessToken, refreshToken: !!refreshToken, type });
      if (accessToken && refreshToken && type === "recovery") {
        setInRecovery(true);
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            console.log("[reset-password] setSession error:", error);
            if (error) {
              setInRecovery(false);
              Toast.show({ type: "error", text1: error.message });
            } else {
              setSessionReady(true);
            }
          });
        return;
      }
    }
    // No hash tokens — log so we can see what format the URL is
    console.log("[reset-password] no recovery hash found in url:", url);
  }

  // PKCE fallback: exchange ?code= for a session
  useEffect(() => {
    if (!code) return;
    const authCode = Array.isArray(code) ? code[0] : code;
    console.log("[reset-password] exchanging code:", authCode);
    setInRecovery(true);
    supabase.auth.exchangeCodeForSession(authCode).then(({ error }) => {
      console.log("[reset-password] exchangeCodeForSession error:", error);
      if (error) {
        setInRecovery(false);
        Toast.show({ type: "error", text1: error.message });
      } else {
        setSessionReady(true);
      }
    });
  }, [code]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit({ password }: ResetPasswordForm) {
    if (!sessionReady) {
      Toast.show({ type: "error", text1: t("common.error") });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      Toast.show({ type: "error", text1: error.message });
      return;
    }

    setInRecovery(false);
    Toast.show({ type: "success", text1: t("auth.passwordUpdated") });
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pt-20 pb-8">
            <Text className="font-serif-display text-4xl text-text-dark dark:text-text-light mb-1">
              {t("auth.headlineReset")}
            </Text>
            <View className="h-px bg-greige dark:bg-brown-mid/50 mb-8 w-12" />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthInput
                  label={t("auth.newPassword")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={
                    errors.password
                      ? t(errors.password.message as string)
                      : undefined
                  }
                  isPassword
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              )}
            />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthInput
                  label={t("auth.confirmPassword")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={
                    errors.confirmPassword
                      ? t(errors.confirmPassword.message as string)
                      : undefined
                  }
                  isPassword
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              )}
            />

            <View className="mt-2">
              <PillButton
                label={
                  isLoading
                    ? t("auth.updatingPassword")
                    : t("auth.updatePassword")
                }
                variant="primary"
                disabled={isLoading || !sessionReady}
                onPress={handleSubmit(onSubmit)}
              />
            </View>

            {!sessionReady && (
              <Text className="font-sans-body text-xs text-greige text-center mt-4">
                {t("common.loading")}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
