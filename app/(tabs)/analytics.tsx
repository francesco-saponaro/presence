import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useUserStore } from "@/store/userStore";
import { useContactsStore } from "@/store/contacts";
import { useShieldStore } from "@/store/shield";
import { supabase } from "@/lib/supabase";
import { syncPendingConnections } from "@/lib/shieldEngine";
import { ACHIEVEMENT_MILESTONES } from "@/lib/blockChallenge";
import {
  formatWarmupLine,
  lastConnectionForContact,
  pickNextTheme,
} from "@/lib/contactRotation";

// Stale-contact threshold (days). At or beyond this, the time-ago label is
// drawn in tan to softly call attention without being alarmist.
const NEGLECT_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeReclaimed(connections: number): string {
  const totalMinutes = connections * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / MS_PER_DAY);
}

function formatLastConnection(
  iso: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!iso) return t("analytics.lastNever");
  const days = daysSince(iso) ?? 0;
  if (days === 0) return t("analytics.lastToday");
  if (days === 1) return t("analytics.lastYesterday");
  if (days < 14) return t("analytics.lastDaysAgo", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return t("analytics.lastWeeksAgo", { count: weeks });
  const months = Math.floor(days / 30);
  return t("analytics.lastMonthsAgo", { count: months });
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
      className="flex-1 bg-surface-light dark:bg-surface-dark rounded-2xl p-4 border border-greige dark:border-brown-mid"
      style={{
        shadowColor: "#422701",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View className="flex-row items-baseline gap-1">
        <Text className="font-serif-display text-3xl text-brown-dark dark:text-tan">
          {value}
        </Text>
        {unit ? (
          <Text className="font-sans-body text-xs text-greige dark:text-brown-mid">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text
        className="font-sans-medium text-[10px] text-brown-mid dark:text-greige uppercase tracking-wider mt-1"
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

interface ProgressBarProps {
  ratio: number; // 0..1
}
function ProgressBar({ ratio }: ProgressBarProps) {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <View className="h-2 rounded-full bg-greige/40 dark:bg-brown-mid/40 overflow-hidden">
      <View
        className="h-full bg-brown-dark dark:bg-tan"
        style={{ width: `${width}%` }}
      />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const connections = useUserStore((s) => s.lifetimeSuccessfulConnections);
  const streak = useUserStore((s) => s.currentStreak);
  const achievementsEarned = useUserStore((s) => s.achievementsEarned);
  const setStats = useUserStore((s) => s.setStats);
  const timeLabel = formatTimeReclaimed(connections);

  const contacts = useContactsStore((s) => s.contacts);
  const pendingConnections = useShieldStore((s) => s.pendingConnections);

  const [isRefreshing, setIsRefreshing] = useState(false);

  /** Contacts sorted by oldest last-connection first (never-connected on top). */
  const orderedContacts = useMemo(() => {
    const decorated = contacts.map((c) => {
      const lastIso = lastConnectionForContact(c.id, pendingConnections);
      return {
        contact: c,
        lastIso,
        lastMs: lastIso ? new Date(lastIso).getTime() : 0,
      };
    });
    decorated.sort((a, b) => a.lastMs - b.lastMs);
    return decorated;
  }, [contacts, pendingConnections]);

  // ── Gamified rollups ────────────────────────────────────────────────────
  //
  // Word bank: distinct keywords the user has matched (from
  // pendingConnections.challengeWord) vs. the total distinct keyword pool
  // across every theme they have configured. This is what the "words landed"
  // progress bar counts.
  //
  // Prompts explored: themes with usedAt !== null vs. total themes.
  //
  // Per-contact roll-ups reuse the same shape scoped to that contact.

  const {
    totalWordPool,
    matchedWords,
    matchedWordsPerContact,
    totalWordsPerContact,
    totalThemes,
    exploredThemes,
  } = useMemo(() => {
    const totalPool = new Set<string>();
    const wordsPerContact: Record<string, Set<string>> = {};
    let themeCount = 0;
    let exploredCount = 0;

    for (const c of contacts) {
      const set = new Set<string>();
      for (const th of c.themes) {
        themeCount += 1;
        if (th.usedAt !== null) exploredCount += 1;
        for (const kw of th.keywords) {
          if (!kw) continue;
          const w = kw.toLowerCase();
          totalPool.add(w);
          set.add(w);
        }
      }
      wordsPerContact[c.id] = set;
    }

    const matched = new Set<string>();
    const matchedPerContact: Record<string, Set<string>> = {};
    for (const conn of pendingConnections) {
      const word = conn.challengeWord?.toLowerCase();
      if (!word) continue;
      matched.add(word);
      if (conn.contactId) {
        (matchedPerContact[conn.contactId] ??= new Set()).add(word);
      }
    }

    return {
      totalWordPool: totalPool.size,
      matchedWords: matched.size,
      matchedWordsPerContact: matchedPerContact,
      totalWordsPerContact: wordsPerContact,
      totalThemes: themeCount,
      exploredThemes: exploredCount,
    };
  }, [contacts, pendingConnections]);

  const wordRatio = totalWordPool === 0 ? 0 : matchedWords / totalWordPool;
  const promptRatio = totalThemes === 0 ? 0 : exploredThemes / totalThemes;

  const nextMilestone = ACHIEVEMENT_MILESTONES.find((m) => !achievementsEarned.includes(m));

  const isContactsEmpty = contacts.length === 0;

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
          <View className="h-px bg-greige/40 dark:bg-brown-mid/30 mb-7" />

          {/* ── Aggregate stats: connections | streak | time ── */}
          <View className="flex-row gap-2.5 mb-8">
            <StatCard value={connections} label={t("analytics.connections")} />
            <StatCard
              value={streak}
              unit={t("analytics.days")}
              label={t("analytics.streak")}
            />
            <StatCard value={timeLabel} label={t("analytics.timeReclaimed")} />
          </View>

          {/* ── Achievements strip ── */}
          <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-widest mb-3">
            {t("analytics.achievementsTitle")}
          </Text>
          <View
            className="bg-surface-light dark:bg-surface-dark rounded-3xl p-5 mb-8 border border-greige dark:border-brown-mid"
            style={{
              shadowColor: "#422701",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            <View className="flex-row flex-wrap gap-2 mb-3">
              {ACHIEVEMENT_MILESTONES.map((milestone) => {
                const unlocked = achievementsEarned.includes(milestone);
                const isNext = !unlocked && milestone === nextMilestone;
                return (
                  <View
                    key={milestone}
                    className={[
                      "flex-row items-center rounded-full px-3 py-1.5 border",
                      unlocked
                        ? "bg-brown-dark dark:bg-tan border-brown-dark dark:border-tan"
                        : isNext
                          ? "bg-tan/30 dark:bg-brown-mid/40 border-tan dark:border-tan"
                          : "bg-transparent border-greige/60 dark:border-brown-mid/60",
                    ].join(" ")}
                  >
                    <Ionicons
                      name={unlocked ? "trophy" : "trophy-outline"}
                      size={12}
                      color={
                        unlocked
                          ? "#FDFBF7"
                          : isNext
                            ? "#422701"
                            : "#C6C0B9"
                      }
                    />
                    <Text
                      className={[
                        "font-sans-medium text-xs ml-1.5",
                        unlocked
                          ? "text-milk dark:text-espresso"
                          : isNext
                            ? "text-brown-dark dark:text-tan"
                            : "text-greige dark:text-brown-mid",
                      ].join(" ")}
                    >
                      {milestone}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text className="font-sans-body text-xs text-brown-mid dark:text-greige leading-relaxed">
              {nextMilestone
                ? t("analytics.achievementNext", { count: nextMilestone })
                : t("analytics.achievementAllDone")}
            </Text>
          </View>

          {/* ── Word bank + Prompts explored ── */}
          {!isContactsEmpty && (
            <>
              <View
                className="bg-surface-light dark:bg-surface-dark rounded-3xl p-5 mb-4 border border-greige dark:border-brown-mid"
                style={{
                  shadowColor: "#422701",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center mb-2">
                  <Ionicons name="pricetags-outline" size={16} color="#705E46" />
                  <Text className="font-sans-medium text-xs text-brown-mid dark:text-tan uppercase tracking-widest ml-2">
                    {t("analytics.wordBankTitle")}
                  </Text>
                </View>
                <Text className="font-serif-display text-lg text-text-dark dark:text-text-light mb-3">
                  {totalWordPool > 0
                    ? t("analytics.wordBankBody", { matched: matchedWords, total: totalWordPool })
                    : t("analytics.wordBankEmpty")}
                </Text>
                {totalWordPool > 0 && <ProgressBar ratio={wordRatio} />}
              </View>

              <View
                className="bg-surface-light dark:bg-surface-dark rounded-3xl p-5 mb-8 border border-greige dark:border-brown-mid"
                style={{
                  shadowColor: "#422701",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center mb-2">
                  <Ionicons name="sparkles-outline" size={16} color="#705E46" />
                  <Text className="font-sans-medium text-xs text-brown-mid dark:text-tan uppercase tracking-widest ml-2">
                    {t("analytics.promptsExploredTitle")}
                  </Text>
                </View>
                <Text className="font-serif-display text-lg text-text-dark dark:text-text-light mb-3">
                  {totalThemes > 0
                    ? t("analytics.promptsExploredBody", { used: exploredThemes, total: totalThemes })
                    : t("analytics.promptsExploredEmpty")}
                </Text>
                {totalThemes > 0 && <ProgressBar ratio={promptRatio} />}
              </View>
            </>
          )}

          {/* ── Your circle section ── */}
          <Text className="font-sans-medium text-xs text-brown-mid dark:text-greige uppercase tracking-widest mb-3">
            {t("analytics.relationshipsSection")}
          </Text>

          {isContactsEmpty ? (
            <View
              className="bg-surface-light dark:bg-surface-dark rounded-3xl px-8 py-8 items-center border border-greige dark:border-brown-mid"
              style={{
                shadowColor: "#422701",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
              }}
            >
              <View
                className="w-12 h-12 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: "rgba(214,181,136,0.2)" }}
              >
                <Ionicons name="people-outline" size={22} color="#705E46" />
              </View>
              <Text className="font-serif-display text-xl text-text-dark dark:text-text-light text-center mb-2">
                {t("analytics.relationshipsEmptyTitle")}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige text-center leading-relaxed">
                {t("analytics.relationshipsEmptyBody")}
              </Text>
            </View>
          ) : (
            <View className="gap-3 mb-8">
              {orderedContacts.map(({ contact, lastIso }) => {
                const themeCount = contact.themes.length;
                const touchedCount = contact.themes.filter((th) => th.usedAt !== null).length;
                const days = daysSince(lastIso);
                const neglected = days === null || days >= NEGLECT_DAYS;
                const lastLabel = formatLastConnection(lastIso, t);
                const suggestion = pickNextTheme(contact);
                const showSuggestion =
                  suggestion !== null && suggestion.usedAt === null;

                const wordsTotal = totalWordsPerContact[contact.id]?.size ?? 0;
                const wordsMatched = matchedWordsPerContact[contact.id]?.size ?? 0;
                const promptRatioPerContact =
                  themeCount === 0 ? 0 : touchedCount / themeCount;

                return (
                  <View
                    key={contact.id}
                    className="bg-surface-light dark:bg-surface-dark rounded-2xl px-5 py-4 border border-greige/60 dark:border-brown-mid/60"
                    style={{
                      shadowColor: "#422701",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.05,
                      shadowRadius: 8,
                      elevation: 2,
                    }}
                  >
                    {/* Header: avatar + name + last-connection */}
                    <View className="flex-row items-center">
                      <View
                        className="w-11 h-11 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: "rgba(214,181,136,0.25)" }}
                      >
                        <Text className="font-sans-bold text-base text-brown-dark dark:text-tan">
                          {contact.name[0]?.toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                          {contact.name}
                        </Text>
                        <Text
                          className={`font-sans-body text-xs mt-0.5 ${
                            neglected
                              ? "text-brown-dark dark:text-tan font-sans-medium"
                              : "text-greige dark:text-brown-mid"
                          }`}
                        >
                          {lastLabel}
                        </Text>
                      </View>
                    </View>

                    {/* Prompts progress bar */}
                    {themeCount > 0 && (
                      <View className="mt-3 pt-3 border-t border-greige/30 dark:border-brown-mid/30">
                        <View className="flex-row items-center justify-between mb-1.5">
                          <View className="flex-row items-center">
                            <Ionicons name="sparkles-outline" size={12} color="#705E46" />
                            <Text className="font-sans-body text-xs text-brown-mid dark:text-greige ml-1.5">
                              {t("analytics.themesProgress", {
                                used: touchedCount,
                                total: themeCount,
                              })}
                            </Text>
                          </View>
                        </View>
                        <ProgressBar ratio={promptRatioPerContact} />
                      </View>
                    )}
                    {themeCount === 0 && (
                      <View className="flex-row items-center mt-3 pt-3 border-t border-greige/30 dark:border-brown-mid/30">
                        <Ionicons name="alert-circle-outline" size={14} color="#C6C0B9" />
                        <Text className="font-sans-body text-xs text-greige ml-1.5">
                          {t("analytics.themesNone")}
                        </Text>
                      </View>
                    )}

                    {/* Words landed per contact */}
                    {wordsTotal > 0 && (
                      <View className="mt-3">
                        <View className="flex-row items-center mb-1.5">
                          <Ionicons name="pricetags-outline" size={12} color="#705E46" />
                          <Text className="font-sans-body text-xs text-brown-mid dark:text-greige ml-1.5">
                            {t("analytics.perContactWords", {
                              matched: wordsMatched,
                              total: wordsTotal,
                            })}
                          </Text>
                        </View>
                        <ProgressBar ratio={wordsMatched / wordsTotal} />
                      </View>
                    )}

                    {/* Suggestion (only when a fresh unused theme exists) */}
                    {showSuggestion && (
                      <View
                        className="mt-3 rounded-xl px-3 py-2.5"
                        style={{ backgroundColor: "rgba(214,181,136,0.18)" }}
                      >
                        <Text className="font-sans-medium text-[10px] text-brown-mid dark:text-greige uppercase tracking-widest mb-1">
                          {t("analytics.suggestionLabel")}
                        </Text>
                        <Text className="font-serif-display text-sm text-brown-dark dark:text-tan leading-relaxed">
                          &ldquo;{formatWarmupLine(contact, suggestion)}&rdquo;
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
