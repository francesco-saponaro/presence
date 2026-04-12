/**
 * lib/timezone.ts
 *
 * Utilities for local ↔ UTC block-time conversion.
 *
 * Storage contract (see store/routine.ts):
 *   blockTimeUtc is the result of `new Date().toISOString()` after calling
 *   `date.setHours(localHour, localMinute, 0, 0)`.  This is a full ISO string
 *   whose UTC value encodes the user's local hour at the moment they configured
 *   their routine.
 *
 * Usage example:
 *   User is UTC+1, picks 8:00 PM → date.setHours(20,0,0,0) → ISO = "...T19:00:00.000Z"
 *   getLocalBlockHour("...T19:00:00.000Z")   → 20  (date-fns getHours returns LOCAL time)
 *   isBlockTimeActive(blockTimeUtc, "daily") → true after 8 PM local
 */

import { parseISO, getHours, getMinutes } from "date-fns";

export interface LocalTime {
  hour: number;
  minute: number;
}

/** Extract the LOCAL hour & minute from a UTC ISO block-time string. */
export function getLocalBlockTime(blockTimeUtc: string): LocalTime {
  const date = parseISO(blockTimeUtc);
  return { hour: getHours(date), minute: getMinutes(date) };
}

/**
 * Returns true if the shield should be active right now according to
 * the user's chosen routine (block time + frequency).
 *
 * Shield is active from blockTime until midnight (end of calendar day).
 */
export function isBlockTimeActive(
  blockTimeUtc: string,
  frequency: "daily" | "5x" | "weekends" | null
): boolean {
  if (!frequency) return false;

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday … 6 = Saturday

  const activeOnDay = (() => {
    switch (frequency) {
      case "daily":    return true;
      case "5x":       return dayOfWeek >= 1 && dayOfWeek <= 5; // Mon–Fri
      case "weekends": return dayOfWeek === 0 || dayOfWeek === 6;
      default:         return false;
    }
  })();

  if (!activeOnDay) return false;

  const { hour, minute } = getLocalBlockTime(blockTimeUtc);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const blockMinutes = hour * 60 + minute;

  return nowMinutes >= blockMinutes;
}

/**
 * Human-readable block time in the device locale (e.g. "8:00 PM" / "20:00").
 */
export function formatBlockTime(blockTimeUtc: string): string {
  const { hour, minute } = getLocalBlockTime(blockTimeUtc);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Milliseconds until the next block-time trigger.
 * If the block time has already passed today, returns ms until tomorrow's trigger.
 */
export function msUntilNextBlock(blockTimeUtc: string): number {
  const { hour, minute } = getLocalBlockTime(blockTimeUtc);
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Human-readable countdown string, e.g. "in 3h 24m" or "in 45m".
 */
export function formatCountdown(blockTimeUtc: string): string {
  const ms = msUntilNextBlock(blockTimeUtc);
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `in ${minutes}m`;
  if (minutes === 0) return `in ${hours}h`;
  return `in ${hours}h ${minutes}m`;
}
