import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AuthInputProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
}

/**
 * Styled text input for all auth screens.
 * Handles focus highlight, error state, and password visibility toggle.
 */
export function AuthInput({ label, error, isPassword, ...props }: AuthInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const borderColor = error
    ? "border-red-400"
    : isFocused
      ? "border-brown-mid dark:border-tan"
      : "border-greige dark:border-brown-mid/50";

  return (
    <View className="mb-4">
      <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-widest mb-2">
        {label}
      </Text>

      <View
        className={`flex-row items-center bg-surface-light dark:bg-surface-dark rounded-2xl px-4 border ${borderColor}`}
        style={{ minHeight: 54 }}
      >
        <TextInput
          {...props}
          secureTextEntry={isPassword && !isVisible}
          onFocus={(e) => { setIsFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setIsFocused(false); props.onBlur?.(e); }}
          className="flex-1 font-sans-body text-base text-text-dark dark:text-text-light py-3"
          placeholderTextColor="#C6C0B9"
          autoCapitalize={props.autoCapitalize ?? "none"}
          autoCorrect={false}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setIsVisible((v) => !v)}
            className="pl-2 py-2"
            activeOpacity={0.6}
          >
            <Ionicons
              name={isVisible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#705E46"
            />
          </TouchableOpacity>
        )}
      </View>

      {!!error && (
        <Text className="font-sans-body text-xs text-red-400 mt-1.5 ml-1">
          {error}
        </Text>
      )}
    </View>
  );
}
