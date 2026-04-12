import { Tabs } from "expo-router";
import { useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface TabIconProps {
  name: IoniconsName;
  focused: boolean;
}

function TabIcon({ name, focused }: TabIconProps) {
  const isDark = useColorScheme() === "dark";
  const color = focused
    ? isDark ? "#D6B588" : "#422701"  // tan / brown-dark
    : isDark ? "#705E46" : "#C6C0B9"; // brown-mid / greige
  return <Ionicons name={name} size={22} color={color} />;
}

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? "#261B10" : "#FAF7F2",
          borderTopColor: isDark ? "#3A2A1A" : "#EBE6DF",
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: isDark ? "#D6B588" : "#422701",
        tabBarInactiveTintColor: isDark ? "#705E46" : "#C6C0B9",
        tabBarLabelStyle: {
          fontFamily: "DMSans-Medium",
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home.tab"),
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t("analytics.tab"),
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? "bar-chart" : "bar-chart-outline"} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile.tab"),
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? "person" : "person-outline"} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
