import { TouchableOpacity, Text, ViewStyle } from "react-native";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  selected?: boolean;
  disabled?: boolean;
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
  style,
}: Props) {
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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`${base} ${variantClass[variant]} ${disabled ? "opacity-40" : ""}`}
      style={style}
      activeOpacity={0.7}
    >
      <Text className={textClass[variant]}>{label}</Text>
    </TouchableOpacity>
  );
}
