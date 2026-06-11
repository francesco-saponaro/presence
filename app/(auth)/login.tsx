import LogoPng from "@/assets/images/logo-app.png";
import { AuthInput } from "@/components/ui/AuthInput";
import { PillButton } from "@/components/ui/PillButton";
import { signInWithApple, signInWithGoogle } from "@/lib/socialAuth";
import { supabase } from "@/lib/supabase";
import { loginSchema, type LoginForm } from "@/lib/validation";
import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

export default function LoginScreen() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const isDark = useColorScheme() === "dark";
  const socialIconColor = isDark ? "#FDFBF7" : "#2A1800";
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit({ email, password }: LoginForm) {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsLoading(false);

    if (error) {
      Toast.show({ type: "error", text1: error.message });
      return;
    }
    // SIGNED_IN event in _layout.tsx handles routing.
  }

  async function handleApple() {
    setIsLoading(true);
    try {
      const { error } = await signInWithApple();
      if (error) Toast.show({ type: "error", text1: error.message });
      // onAuthStateChange in _layout.tsx handles session + routing
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        Toast.show({ type: "error", text1: e?.message ?? t("common.error") });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogle() {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // onAuthStateChange in _layout.tsx handles session + routing
    } catch (e: any) {
      if (e?.code !== "SIGN_IN_CANCELLED") {
        Toast.show({ type: "error", text1: e?.message ?? t("common.error") });
      }
    } finally {
      setIsLoading(false);
    }
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
            {/* App name */}
            <View className="flex-col items-center justify-center">
              <Image
                source={LogoPng}
                style={{ width: 240, height: 80 }}
                contentFit="cover"
              />
              <Text className="font-serif-display text-lg text-brown-mid dark:text-tan text-center mb-10 tracking-widest uppercase">
                Presence
              </Text>
            </View>

            {/* Headline */}
            <Text className="font-serif-display text-4xl text-text-dark dark:text-text-light mb-2">
              {t("auth.headlineLogin")}
            </Text>
            <View className="h-px bg-greige dark:bg-brown-mid/50 mb-8 w-12" />

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
                  error={
                    errors.email ? t(errors.email.message as string) : undefined
                  }
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
                  error={
                    errors.password
                      ? t(errors.password.message as string)
                      : undefined
                  }
                  isPassword
                  autoComplete="password"
                  placeholder="••••••••"
                />
              )}
            />

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => router.push("/(auth)/forgot-password")}
              className="self-end -mt-2 mb-6"
              activeOpacity={0.6}
            >
              <Text className="font-sans-medium text-sm text-brown-mid dark:text-greige underline">
                {t("auth.forgotPassword")}
              </Text>
            </TouchableOpacity>

            {/* Sign in CTA */}
            <PillButton
              label={isLoading ? t("auth.signingIn") : t("auth.login")}
              variant="primary"
              disabled={isLoading}
              onPress={handleSubmit(onSubmit)}
            />

            {/* Divider */}
            <View className="flex-row items-center gap-3 my-6">
              <View className="flex-1 h-px bg-greige dark:bg-brown-mid/40" />
              <Text className="font-sans-body text-xs text-greige dark:text-brown-mid">
                {t("auth.orContinueWith")}
              </Text>
              <View className="flex-1 h-px bg-greige dark:bg-brown-mid/40" />
            </View>

            {/* Social buttons */}
            <View className="gap-3 mb-8">
              {Platform.OS === "ios" && (
                <TouchableOpacity
                  onPress={handleApple}
                  activeOpacity={0.7}
                  disabled={isLoading}
                  className="flex-row items-center justify-center gap-3 rounded-full border border-greige dark:border-brown-mid py-4 px-6"
                >
                  <Ionicons name="logo-apple" size={20} color={socialIconColor} />
                  <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                    {t("auth.apple")}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleGoogle}
                activeOpacity={0.7}
                disabled={isLoading}
                className="flex-row items-center justify-center gap-3 rounded-full border border-greige dark:border-brown-mid py-4 px-6"
              >
                <Ionicons name="logo-google" size={18} color={socialIconColor} />
                <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                  {t("auth.google")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign up link */}
            <View className="flex-row justify-center gap-1">
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige">
                {t("auth.noAccount")}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/signup")}
                activeOpacity={0.6}
              >
                <Text className="font-sans-bold text-sm text-brown-dark dark:text-tan underline">
                  {t("auth.signUpLink")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
