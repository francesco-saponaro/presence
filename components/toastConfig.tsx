import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ToastConfig } from "react-native-toast-message";

/**
 * Cappuccino-palette toast layouts.
 * Success   → tan background, dark brown text.
 * Error     → dark brown background, light text.
 * Info      → surface card background.
 * Prominent → larger surface card with an alarm icon + thick tan border, for
 *             important messages that must not be missed (e.g. "shield starts
 *             tomorrow" when the chosen time is under 20 minutes away).
 */
export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }) => (
    <View
      className="mx-5 rounded-2xl bg-tan px-5 py-4"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      <Text className="font-sans-bold text-sm text-brown-dark">{text1}</Text>
      {!!text2 && (
        <Text className="font-sans-body text-xs text-brown-mid mt-1">{text2}</Text>
      )}
    </View>
  ),

  error: ({ text1, text2 }) => (
    <View
      className="mx-5 rounded-2xl bg-brown-dark px-5 py-4"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      <Text className="font-sans-bold text-sm text-text-light">{text1}</Text>
      {!!text2 && (
        <Text className="font-sans-body text-xs text-greige mt-1">{text2}</Text>
      )}
    </View>
  ),

  info: ({ text1, text2 }) => (
    <View
      className="mx-5 rounded-2xl bg-surface-light dark:bg-surface-dark px-5 py-4 border border-greige"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
      }}
    >
      <Text className="font-sans-bold text-sm text-text-dark dark:text-text-light">{text1}</Text>
      {!!text2 && (
        <Text className="font-sans-body text-xs text-brown-mid mt-1">{text2}</Text>
      )}
    </View>
  ),

  prominent: ({ text1, text2 }) => (
    <View
      className="mx-4 rounded-3xl bg-surface-light dark:bg-surface-dark px-6 py-5 border-2 border-tan flex-row items-start gap-3"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      <Ionicons name="alarm-outline" size={26} color="#705E46" style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="font-sans-bold text-base text-text-dark dark:text-text-light">{text1}</Text>
        {!!text2 && (
          <Text className="font-sans-body text-sm text-brown-mid dark:text-greige mt-1 leading-5">
            {text2}
          </Text>
        )}
      </View>
    </View>
  ),
};
