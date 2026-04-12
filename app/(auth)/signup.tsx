import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { signupSchema, type SignupForm } from "@/lib/validation";
import { AuthInput } from "@/components/ui/AuthInput";
import { PillButton } from "@/components/ui/PillButton";

export default function SignupScreen() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const { control, handleSubmit, formState: { errors }, watch, setValue } =
    useForm<SignupForm>({
      resolver: zodResolver(signupSchema),
      defaultValues: { email: "", password: "", confirmPassword: "", tosAccepted: undefined as any },
    });

  const tosAccepted = watch("tosAccepted");

  async function onSubmit({ email, password }: SignupForm) {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);

    if (error) {
      Toast.show({ type: "error", text1: error.message });
      return;
    }

    // If email confirmation is disabled in Supabase, onAuthStateChange fires
    // SIGNED_IN immediately and index.tsx routes to onboarding.
    // If enabled, show a "check your email" toast and stay on this screen.
    Toast.show({
      type: "success",
      text1: t("auth.resetSent"),
      text2: t("auth.resetSentBody", { email }),
    });
  }

  function handleSocialPlaceholder() {
    Toast.show({
      type: "info",
      text1: "Coming soon",
      text2: "Social sign-in will be available in an upcoming update.",
    });
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
          <View className="flex-1 px-6 pt-14 pb-8">
            {/* Back */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="self-start mb-8 flex-row items-center gap-1"
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={20} color="#705E46" />
              <Text className="font-sans-medium text-sm text-brown-mid dark:text-greige">
                {t("common.back")}
              </Text>
            </TouchableOpacity>

            {/* Headline */}
            <Text className="font-serif-display text-4xl text-text-dark dark:text-text-light mb-1">
              {t("auth.headlineSignup")}
            </Text>
            <Text className="font-sans-body text-sm text-brown-mid dark:text-greige mb-8">
              {t("auth.subtitleSignup")}
            </Text>

            {/* Form */}
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

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthInput
                  label={t("auth.password")}
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

            {/* TOS checkbox */}
            <TouchableOpacity
              onPress={() => setValue("tosAccepted", tosAccepted ? (undefined as any) : true)}
              activeOpacity={0.7}
              className="flex-row items-start gap-3 mb-2"
            >
              <View
                className={[
                  "w-5 h-5 rounded-md border-2 mt-0.5 items-center justify-center flex-shrink-0",
                  tosAccepted
                    ? "bg-brown-dark border-brown-dark dark:bg-tan dark:border-tan"
                    : "border-greige dark:border-brown-mid",
                ].join(" ")}
              >
                {tosAccepted && (
                  <Text className="text-text-light dark:text-espresso text-xs font-sans-bold leading-none">
                    ✓
                  </Text>
                )}
              </View>
              <Text className="flex-1 font-sans-body text-sm text-brown-mid dark:text-greige leading-relaxed">
                {t("auth.tosAgreement")}
              </Text>
            </TouchableOpacity>
            {errors.tosAccepted && (
              <Text className="font-sans-body text-xs text-red-400 mb-4 ml-8">
                {t(errors.tosAccepted.message as string)}
              </Text>
            )}

            {/* CTA */}
            <View className="mt-4">
              <PillButton
                label={isLoading ? t("auth.creatingAccount") : t("auth.signup")}
                variant="primary"
                disabled={isLoading}
                onPress={handleSubmit(onSubmit)}
              />
            </View>

            {/* Divider */}
            <View className="flex-row items-center gap-3 my-6">
              <View className="flex-1 h-px bg-greige dark:bg-brown-mid/40" />
              <Text className="font-sans-body text-xs text-greige dark:text-brown-mid">
                {t("auth.orContinueWith")}
              </Text>
              <View className="flex-1 h-px bg-greige dark:bg-brown-mid/40" />
            </View>

            {/* Social */}
            <View className="gap-3 mb-8">
              <TouchableOpacity
                onPress={handleSocialPlaceholder}
                activeOpacity={0.7}
                className="flex-row items-center justify-center gap-3 rounded-full border border-greige dark:border-brown-mid py-4 px-6"
              >
                <Ionicons name="logo-apple" size={20} color="#2A1800" />
                <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                  {t("auth.apple")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSocialPlaceholder}
                activeOpacity={0.7}
                className="flex-row items-center justify-center gap-3 rounded-full border border-greige dark:border-brown-mid py-4 px-6"
              >
                <Ionicons name="logo-google" size={18} color="#2A1800" />
                <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                  {t("auth.google")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign in link */}
            <View className="flex-row justify-center gap-1">
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige">
                {t("auth.hasAccount")}
              </Text>
              <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
                <Text className="font-sans-bold text-sm text-brown-dark dark:text-tan underline">
                  {t("auth.signInLink")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
