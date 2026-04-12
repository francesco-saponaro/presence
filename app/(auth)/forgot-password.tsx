import { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { forgotPasswordSchema, type ForgotPasswordForm } from "@/lib/validation";
import { AuthInput } from "@/components/ui/AuthInput";
import { PillButton } from "@/components/ui/PillButton";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const { control, handleSubmit, formState: { errors } } =
    useForm<ForgotPasswordForm>({
      resolver: zodResolver(forgotPasswordSchema),
      defaultValues: { email: "" },
    });

  async function onSubmit({ email }: ForgotPasswordForm) {
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Deep link: opens app → app/reset-password.tsx processes the token.
      redirectTo: "presence://reset-password",
    });
    setIsLoading(false);

    if (error) {
      Toast.show({ type: "error", text1: error.message });
      return;
    }

    setSentTo(email);
  }

  // ── Confirmation state ──────────────────────────────────────────────────────
  if (sentTo) {
    return (
      <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
        <View className="flex-1 px-6 items-center justify-center">
          {/* Checkmark */}
          <View className="w-20 h-20 rounded-full bg-surface-light dark:bg-surface-dark items-center justify-center mb-8 border border-greige dark:border-brown-mid">
            <Ionicons name="checkmark" size={36} color="#705E46" />
          </View>

          <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light text-center mb-3">
            {t("auth.resetSent")}
          </Text>
          <Text className="font-sans-body text-base text-brown-mid dark:text-greige text-center leading-relaxed px-4 mb-10">
            {t("auth.resetSentBody", { email: sentTo })}
          </Text>

          <PillButton
            label={t("auth.backToLogin")}
            variant="secondary"
            onPress={() => router.replace("/(auth)/login")}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Form state ──────────────────────────────────────────────────────────────
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
          <View className="flex-1 px-6 pt-14 pb-8">
            {/* Back */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="self-start mb-10 flex-row items-center gap-1"
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={20} color="#705E46" />
              <Text className="font-sans-medium text-sm text-brown-mid dark:text-greige">
                {t("common.back")}
              </Text>
            </TouchableOpacity>

            <Text className="font-serif-display text-4xl text-text-dark dark:text-text-light mb-1">
              {t("auth.headlineForgot")}
            </Text>
            <Text className="font-sans-body text-sm text-brown-mid dark:text-greige mb-8">
              {t("auth.subtitleForgot")}
            </Text>

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthInput
                  label={t("auth.email")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email ? t(errors.email.message as string) : undefined}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              )}
            />

            <View className="mt-2">
              <PillButton
                label={isLoading ? t("auth.sendingReset") : t("auth.sendReset")}
                variant="primary"
                disabled={isLoading}
                onPress={handleSubmit(onSubmit)}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
