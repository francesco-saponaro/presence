import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
  ViewStyle,
} from "react-native";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  selected?: boolean;
  disabled?: boolean;
  /** When true, renders a small spinner next to the label and blocks taps. */
  loading?: boolean;
  style?: ViewStyle;
}

/**
 * Thick, fully-rounded pill button in the Cappuccino palette.
 *
 * variant="primary"   → dark brown fill  (CTA)
 * variant="secondary" → tan fill         (secondary action)
 * variant="outline"   → greige border    (survey / selector options)
 * variant="ghost"     → no border/bg     (links / restore)
 */
export function PillButton({
  label,
  onPress,
  variant = "primary",
  selected = false,
  disabled = false,
  loading = false,
  style,
}: Props) {
  const isDark = useColorScheme() === "dark";

  const base =
    "items-center justify-center rounded-full px-6 py-4 active:opacity-70";

  const variantClass: Record<string, string> = {
    primary:
      "bg-brown-dark dark:bg-tan",
    secondary:
      "bg-tan dark:bg-brown-mid",
    outline: selected
      ? "bg-brown-mid border border-brown-mid"
      : "bg-transparent border border-greige dark:border-brown-mid",
    ghost:
      "bg-transparent",
  };

  const textClass: Record<string, string> = {
    primary:
      "font-sans-bold text-base text-text-light dark:text-espresso",
    secondary:
      "font-sans-bold text-base text-brown-dark dark:text-text-light",
    outline: selected
      ? "font-sans-bold text-base text-text-light"
      : "font-sans-medium text-base text-brown-mid dark:text-greige",
    ghost:
      "font-sans-medium text-sm text-brown-mid dark:text-greige underline",
  };

  // Spinner colour follows the variant's text colour for the active scheme,
  // so the loader reads correctly on the paywall's dark backdrop AND on any
  // light-themed screen that adopts loading={true}.
  const spinnerColor: string = (() => {
    switch (variant) {
      case "primary":
        return isDark ? "#261B10" : "#FDFBF7";
      case "secondary":
        return isDark ? "#FDFBF7" : "#422701";
      case "outline":
        return selected ? "#FDFBF7" : isDark ? "#C6C0B9" : "#705E46";
      case "ghost":
        return isDark ? "#C6C0B9" : "#705E46";
      default:
        return "#FDFBF7";
    }
  })();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${base} ${variantClass[variant]} ${disabled || loading ? "opacity-40" : ""}`}
      style={style}
      activeOpacity={0.7}
    >
      <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
        {loading && <ActivityIndicator color={spinnerColor} size="small" />}
        <Text className={textClass[variant]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}
