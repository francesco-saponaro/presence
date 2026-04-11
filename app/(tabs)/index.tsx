import { View, Text, Button } from "react-native";
import { useShieldStore } from "@/store/shield";
import { useUserStore } from "@/store/userStore";

export default function HomeScreen() {
  const isBlocked = useShieldStore((s) => s.isBlocked);
  const setBlocked = useShieldStore((s) => s.setBlocked);
  const connections = useUserStore((s) => s.lifetimeSuccessfulConnections);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Home</Text>
      <Text>Shield status: {isBlocked ? "BLOCKED" : "Unblocked"}</Text>
      <Text>Lifetime connections: {connections}</Text>
      <Text style={{ color: "grey" }}>[Status indicator + countdown + upload button — Phase 5]</Text>
      <Button
        title={isBlocked ? "[DEV] Unblock" : "[DEV] Activate Shield"}
        onPress={() => setBlocked(!isBlocked)}
      />
    </View>
  );
}
