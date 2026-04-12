import { View } from "react-native";

interface Props {
  current: number; // 1-based
  total: number;
}

export function OnboardingProgress({ current, total }: Props) {
  return (
    <View className="flex-row items-center justify-center gap-2 pt-2 pb-1">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          className={[
            "rounded-full",
            i < current
              ? "bg-brown-mid w-6 h-2"   // completed / active — elongated pill
              : "bg-greige w-2 h-2",     // upcoming — small dot
          ].join(" ")}
        />
      ))}
    </View>
  );
}
