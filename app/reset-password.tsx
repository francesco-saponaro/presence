import { AuthInput } from "@/components/ui/AuthInput";
import { PillButton } from "@/components/ui/PillButton";
import { supabase } from "@/lib/supabase";
import { resetPasswordSchema, type ResetPasswordForm } from "@/lib/validation";
import { zodResolver } from "@hookform/resolvers/zod";
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

/**
 * Handles the password-reset deep link: presence://reset-password
 *
 * PKCE flow (flowType: 'pkce' in lib/supabase.ts):
 *   Supabase redirects with a ?code= query param.
 *   We call supabase.auth.exchangeCodeForSession(url) to establish the session.
 *
 * Implicit fallback (legacy):
 *   presence://reset-password#access_token=...&refresh_token=...&type=recovery
 *   We call supabase.auth.setSession() with the parsed tokens.
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Expo Router parses the deep link and passes ?code= as a route param.
  // presence://reset-password?code=XXXX → { code: 'XXXX' }
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (!code) return;
    const authCode = Array.isArray(code) ? code[0] : code;
    supabase.auth.exchangeCodeForSession(authCode).then(({ error }) => {
      if (!error) setSessionReady(true);
      else Toast.show({ type: "error", text1: error.message });
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
