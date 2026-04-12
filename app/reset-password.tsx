import { useState, useEffect } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { resetPasswordSchema, type ResetPasswordForm } from "@/lib/validation";
import { AuthInput } from "@/components/ui/AuthInput";
import { PillButton } from "@/components/ui/PillButton";

/**
 * Handles the password-reset deep link: presence://reset-password
 *
 * Supabase appends the recovery token as URL hash fragments:
 *   presence://reset-password#access_token=...&refresh_token=...&type=recovery
 *
 * We parse these, call supabase.auth.setSession(), then let the user set a new password.
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Extract tokens from the deep-link URL on mount.
  useEffect(() => {
    async function processDeepLink(url: string) {
      // Hash fragment contains access_token & refresh_token
      const parsed = Linking.parse(url);
      const hash = (url.split("#")[1] ?? "");
      const params = Object.fromEntries(new URLSearchParams(hash));

      if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (!error) setSessionReady(true);
        else Toast.show({ type: "error", text1: error.message });
      }
    }

    // App opened from a cold start via deep link
    Linking.getInitialURL().then((url) => {
      if (url) processDeepLink(url);
    });

    // App was foregrounded via deep link
    const sub = Linking.addEventListener("url", ({ url }) => processDeepLink(url));
    return () => sub.remove();
  }, []);

  const { control, handleSubmit, formState: { errors } } =
    useForm<ResetPasswordForm>({
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
                  error={errors.password ? t(errors.password.message as string) : undefined}
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
                  error={errors.confirmPassword ? t(errors.confirmPassword.message as string) : undefined}
                  isPassword
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              )}
            />

            <View className="mt-2">
              <PillButton
                label={isLoading ? t("auth.updatingPassword") : t("auth.updatePassword")}
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
