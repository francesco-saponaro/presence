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
import { addMinutes, addHours, isAfter } from "date-fns";
import { getLocalBlockTime } from "@/lib/timezone";
import { useRoutineStore } from "@/store/routine";

// Notification identifiers — used to cancel & re-schedule without duplicates
const WARMUP_ID = "presence-warmup";
const INACTIVITY_ID = "presence-inactivity";

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
 * Schedule (or re-schedule) the warm-up notification.
 * Cancels any previous warm-up before scheduling the new one.
 *
 * @param blockTimeUtc  "HH:MM" string stored in UTC (from routines table)
 * @param frequency     "daily" | "5x" | "weekends"
 */
export async function scheduleWarmupNotification(
  blockTimeUtc: string,
  frequency: string
): Promise<void> {
  // Always cancel the old one first to avoid duplicates
  await Notifications.cancelScheduledNotificationAsync(WARMUP_ID).catch(() => {});

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureNotificationChannel();

  const { hour, minute } = getLocalBlockTime(blockTimeUtc);

  // Compute the next fire time (today or tomorrow) for the warm-up (15 min early)
  const now = new Date();
  const candidateToday = new Date(now);
  candidateToday.setHours(hour, minute, 0, 0);
  const warmupToday = addMinutes(candidateToday, -15);

  // If the warm-up time has already passed today, schedule for tomorrow
  const fireDate = isAfter(warmupToday, now) ? warmupToday : (() => {
    const tomorrow = addMinutes(candidateToday, -15);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  })();

  // For frequency other than "daily", use a one-shot trigger on the next valid day
  // and let the app reschedule on the next foreground event.
  // (Daily repeat is safe for all frequencies since the shield engine controls actual blocking.)
  const trigger: Notifications.NotificationTriggerInput =
    frequency === "daily"
      ? {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: fireDate.getHours(),
          minute: fireDate.getMinutes(),
          channelId: "presence-reminders",
        }
      : {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
          channelId: "presence-reminders",
        };

  await Notifications.scheduleNotificationAsync({
    identifier: WARMUP_ID,
    content: {
      title: "Presence",
      body: "Your scroll shield goes up in 15 minutes. Who haven't you spoken to in a while?",
      sound: true,
      data: { type: "warmup" },
    },
    trigger,
  });
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
      body: "It's been a few days. Take 2 minutes to ask a friend how they're doing.",
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
  await Notifications.cancelScheduledNotificationAsync(WARMUP_ID).catch(() => {});
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
