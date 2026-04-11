import { View, Text } from "react-native";
import { useUserStore } from "@/store/userStore";

export default function AnalyticsScreen() {
  const connections = useUserStore((s) => s.lifetimeSuccessfulConnections);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Analytics</Text>
      <Text>Genuine Connections: {connections}</Text>
      <Text>Current Streak: 0</Text>
      <Text>Time Reclaimed: 0 hrs</Text>
      <Text style={{ color: "grey" }}>[Charts + empty state illustration — Phase 5]</Text>
    </View>
  );
}
