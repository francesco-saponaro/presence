/**
 * Expo local push notifications — Phase 7
 *
 * Two notification types:
 *   1. Warm-up  — fires 15 minutes before the user's block time (daily/frequency-aware)
 *   2. Inactivity — fires 48 hours after the user's last successful connection
 *
 * Requires expo-notifications:
 *   npx expo install expo-notifications
 * Then add to app.json plugins:
 *   { "expo-notifications": { "icon": "./assets/images/notification-icon.png" } }
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addHours } from "date-fns";
import i18n from "@/i18n";
import { getLocalBlockTime } from "@/lib/timezone";
import { useRoutineStore } from "@/store/routine";
import { useContactsStore } from "@/store/contacts";
import { useShieldStore } from "@/store/shield";
import {
  formatWarmupLine,
  pickNextContact,
  pickNextTheme,
} from "@/lib/contactRotation";

// Notification identifiers — used to cancel & re-schedule without duplicates
const WARMUP_ID = "presence-warmup";
const INACTIVITY_ID = "presence-inactivity";

// Active block weekdays per frequency, in Expo's WEEKLY-trigger convention
// (1 = Sunday, 2 = Monday … 7 = Saturday).
const ACTIVE_WEEKDAYS: Record<string, number[]> = {
  "5x": [2, 3, 4, 5, 6], // Mon–Fri
  weekends: [1, 7],      // Sun, Sat
};

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ─── Android channel ──────────────────────────────────────────────────────────

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("presence-reminders", {
    name: "Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#D6B588", // tan accent
  });
}

// ─── Warm-up notification (15 min before block time) ─────────────────────────

/**
 * Schedule (or re-schedule) the warm-up notification, 15 minutes before block time.
 * Cancels any previous warm-ups first.
 *
 * Frequency-aware:
 *   • "daily"    → one repeating DAILY trigger.
 *   • "5x"       → repeating WEEKLY triggers on Mon–Fri.
 *   • "weekends" → repeating WEEKLY triggers on Sat & Sun.
 * Repeating triggers fire on their own without the app being foregrounded, and
 * only on real blocking days (so no "shield goes up" reminder on an off day).
 *
 * @param blockTimeUtc  UTC ISO string encoding the local block time
 * @param frequency     "daily" | "5x" | "weekends"
 */
export async function scheduleWarmupNotification(
  blockTimeUtc: string,
  frequency: string
): Promise<void> {
  // Clear every previously-scheduled warm-up (daily + per-weekday) to avoid dupes.
  await cancelWarmupNotification();

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureNotificationChannel();

  const { hour, minute } = getLocalBlockTime(blockTimeUtc);

  // Warm-up fires 15 min before block time. If that crosses midnight backwards,
  // it lands on the PREVIOUS day (dayOffset = -1), which shifts the fire weekday.
  let warmupMinutes = hour * 60 + minute - 15;
  let dayOffset = 0;
  if (warmupMinutes < 0) {
    warmupMinutes += 24 * 60;
    dayOffset = -1;
  }
  const warmupHour = Math.floor(warmupMinutes / 60);
  const warmupMinute = warmupMinutes % 60;

  // Ensure the notification body names the same (contact + word) the Home
  // screen will show. Two steps, in order:
  //   1. Hydrate from server — protects against the reinstall / cross-device
  //      case where the local persist is empty but the server has an active
  //      row that we should honour rather than overwrite.
  //   2. Assign only if still needed — idempotent (no force). If a challenge
  //      is already set (locally or just hydrated), this is a no-op. If the
  //      previous cycle was just resolved (via onConnectionVerified), a fresh
  //      one is assigned here for the next block.
  // Lazy require to break the notifications → blockChallenge → contactsSync →
  // notifications import cycle (contactsSync calls scheduleWarmup on regen).
  try {
    const bc = require("@/lib/blockChallenge") as typeof import("@/lib/blockChallenge");
    await bc.hydrateActiveChallengeFromServer();
    await bc.assignChallengeIfNeeded();
  } catch {
    // Best-effort. Fallback body branches handle no-challenge state.
  }

  const content = {
    title: "Presence",
    body: buildWarmupBody(),
    sound: true,
    data: { type: "warmup" },
  };

  if (frequency === "daily") {
    await Notifications.scheduleNotificationAsync({
      identifier: WARMUP_ID,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: warmupHour,
        minute: warmupMinute,
        channelId: "presence-reminders",
      },
    });
    return;
  }

  // 5x / weekends → one repeating WEEKLY trigger per active block day.
  const blockWeekdays = ACTIVE_WEEKDAYS[frequency] ?? [];
  for (const blockWeekday of blockWeekdays) {
    // Shift to the warm-up's actual fire weekday if it crossed midnight backwards.
    const warmupWeekday = ((blockWeekday - 1 + dayOffset + 7) % 7) + 1;
    await Notifications.scheduleNotificationAsync({
      identifier: `${WARMUP_ID}-${warmupWeekday}`,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: warmupWeekday,
        hour: warmupHour,
        minute: warmupMinute,
        channelId: "presence-reminders",
      },
    });
  }
}

/**
 * Compose the warm-up notification body using the current rotation state.
 * Fallback chain:
 *   1. Challenge-aware: an active challenge is set (assigned in the schedule
 *      flow above) → "Tonight, text {name} something with the word *X*."
 *   2. Targeted: no challenge but a contact + theme is available → composed
 *      prompt line (legacy behaviour — kept for the "no keywords" fallback).
 *   3. Name-only: a contact exists but has no themes yet → generic nudge.
 *   4. Generic: no contacts configured → original copy.
 *
 * Baked in at schedule time (Expo's repeating triggers fire with static
 * bodies). Re-scheduling on connection-verify and theme-regen keeps it fresh.
 */
function buildWarmupBody(): string {
  const challenge = useShieldStore.getState().activeChallenge;
  if (challenge) {
    return i18n.t("notifications.warmupBodyChallenge", {
      name: challenge.contactName,
      word: challenge.word,
    });
  }

  const contacts = useContactsStore.getState().contacts;
  const pending = useShieldStore.getState().pendingConnections;

  const contact = pickNextContact(contacts, pending);
  if (!contact) return i18n.t("notifications.warmupBody");

  const theme = pickNextTheme(contact);
  if (theme) {
    return i18n.t("notifications.warmupBodyTargeted", {
      line: formatWarmupLine(contact, theme),
    });
  }

  return i18n.t("notifications.warmupBodyNoTheme", { name: contact.name });
}

// ─── Achievement notification (fires when a milestone is crossed) ───────────

/**
 * Fires immediately as a one-off local push celebrating a milestone. Not
 * scheduled — the caller (`onConnectionVerified` after `recordConnection`)
 * triggers it in the same tick a milestone is crossed. Data payload includes
 * the milestone so a tap handler can deep-link to the achievements strip.
 */
export async function fireAchievementNotification(milestone: number): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureNotificationChannel();

  await Notifications.scheduleNotificationAsync({
    // No identifier — one-off, fire-and-forget. If several milestones cross in
    // rapid succession they each get their own entry in the notification tray.
    content: {
      title: i18n.t("notifications.achievementTitle", { count: milestone }),
      body: i18n.t("notifications.achievementBody", { count: milestone }),
      sound: true,
      data: { type: "achievement", milestone },
    },
    trigger: null,
  }).catch(() => {});
}

// ─── Inactivity notification (48 h after last connection) ─────────────────────

/**
 * Schedule (or re-schedule) the 48-hour inactivity notification.
 * Call this immediately after every successful OCR verification so the
 * countdown always resets from the most recent connection.
 */
export async function scheduleInactivityNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(INACTIVITY_ID).catch(() => {});

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureNotificationChannel();

  const fireDate = addHours(new Date(), 48);

  await Notifications.scheduleNotificationAsync({
    identifier: INACTIVITY_ID,
    content: {
      title: "Presence",
      body: i18n.t("notifications.inactivityBody"),
      sound: true,
      data: { type: "inactivity" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: "presence-reminders",
    },
  });
}

// ─── Cancel helpers ───────────────────────────────────────────────────────────

export async function cancelWarmupNotification(): Promise<void> {
  // Cancel the daily warm-up and every possible per-weekday warm-up.
  await Notifications.cancelScheduledNotificationAsync(WARMUP_ID).catch(() => {});
  for (let weekday = 1; weekday <= 7; weekday++) {
    await Notifications.cancelScheduledNotificationAsync(`${WARMUP_ID}-${weekday}`).catch(() => {});
  }
}

export async function cancelInactivityNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(INACTIVITY_ID).catch(() => {});
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Called once from _layout.tsx after auth + routine are available.
 * Sets up the notification handler and schedules the warm-up.
 */
export function initNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowList: true,
    }),
  });

  // Schedule warm-up from current routine if one exists
  const { blockTimeUtc, frequency } = useRoutineStore.getState();
  if (blockTimeUtc && frequency) {
    scheduleWarmupNotification(blockTimeUtc, frequency).catch(() => {});
  }
}
