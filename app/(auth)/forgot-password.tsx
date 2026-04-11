import { View, Text, Button } from "react-native";
import { router } from "expo-router";

export default function ForgotPasswordScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Reset Password</Text>
      <Text style={{ color: "grey" }}>[Email input + Supabase magic link — Phase 3]</Text>
      <Button title="Back to Login" onPress={() => router.back()} />
    </View>
  );
}
