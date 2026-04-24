import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useUserStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase";
import { syncPendingConnections } from "@/lib/shieldEngine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeReclaimed(connections: number): string {
  const totalMinutes = connections * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatCardProps {
  value: string | number;
  label: string;
  unit?: string;
}

function StatCard({ value, label, unit }: StatCardProps) {
  return (
    <View
      className="flex-1 bg-surface-light dark:bg-surface-dark rounded-2xl p-5 border border-greige dark:border-brown-mid"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View className="flex-row items-baseline gap-1">
        <Text className="font-serif-display text-4xl text-brown-dark dark:text-tan">
          {value}
        </Text>
        {unit ? (
          <Text className="font-sans-body text-sm text-greige dark:text-brown-mid">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-wider mt-1">
        {label}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const connections = useUserStore((s) => s.lifetimeSuccessfulConnections);
  const streak = useUserStore((s) => s.currentStreak);
  const setStats = useUserStore((s) => s.setStats);
  const timeLabel = formatTimeReclaimed(connections);

  const isEmpty = connections === 0;

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await syncPendingConnections();

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from("profiles")
          .select("lifetime_connections, current_streak")
          .eq("id", session.user.id)
          .single();
        if (data) {
          setStats(data.lifetime_connections, data.current_streak);
        }
      }
    } catch {
      // Silently swallow — local state is already shown
    } finally {
      setIsRefreshing(false);
    }
  }, [setStats]);

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#705E46"
            colors={["#705E46"]}
          />
        }
      >
        <View className="px-6">
          {/* ── Wordmark ── */}
          <Text className="font-serif-display text-lg text-brown-mid dark:text-tan text-center mt-6 mb-2 tracking-widest uppercase">
            Presence
          </Text>
          <View className="h-px bg-greige/40 dark:bg-brown-mid/30 mb-8" />

          {/* ── Stat grid: connections + streak ── */}
          <View className="flex-row gap-3 mb-3">
            <StatCard
              value={connections}
              label={t("analytics.connections")}
            />
            <StatCard
              value={streak}
              unit={t("analytics.days")}
              label={t("analytics.streak")}
            />
          </View>

          {/* ── Time reclaimed (full width) ── */}
          <View
            className="bg-surface-light dark:bg-surface-dark rounded-2xl p-5 mb-8 border border-greige dark:border-brown-mid"
            style={{
              shadowColor: "#422701",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            <View className="flex-row items-baseline gap-1">
              <Text className="font-serif-display text-4xl text-brown-dark dark:text-tan">
                {timeLabel}
              </Text>
            </View>
            <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-wider mt-1">
              {t("analytics.timeReclaimed")}
            </Text>
          </View>

          {/* ── Empty state ── */}
          {isEmpty && (
            <View className="bg-surface-light dark:bg-surface-dark rounded-3xl px-8 py-10 items-center border border-greige dark:border-brown-mid">
              {/* Decorative circle */}
              <View className="w-16 h-16 rounded-full border-2 border-greige dark:border-brown-mid items-center justify-center mb-6">
                <Text className="font-serif-display text-2xl text-greige dark:text-brown-mid">
                  ○
                </Text>
              </View>

              <Text className="font-serif-display text-2xl text-text-dark dark:text-text-light text-center mb-3">
                {t("analytics.emptyTitle")}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige text-center leading-relaxed">
                {t("analytics.empty")}
              </Text>
            </View>
          )}

          {/* ── Insight card (shown when connections > 0) ── */}
          {!isEmpty && (
            <View className="bg-brown-dark dark:bg-surface-dark rounded-3xl px-8 py-7 items-center">
              <Text className="font-serif-display text-xl text-text-light dark:text-tan text-center leading-relaxed mb-1">
                {t("analytics.insightTitle", { count: connections })}
              </Text>
              <Text className="font-sans-body text-sm text-tan/70 dark:text-greige text-center leading-relaxed">
                {t("analytics.insightBody", { time: timeLabel })}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
