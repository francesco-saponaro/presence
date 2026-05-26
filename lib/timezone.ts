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
 *   isBlockTimeActive(blockTimeUtc, "daily", baselineMs) → true once a block
 *     trigger after baselineMs has passed, and stays true until the next
 *     verified connection (overnight persistence).
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

type Frequency = "daily" | "5x" | "weekends";

/** Is the given JS weekday (0=Sun … 6=Sat) an active blocking day for the frequency? */
function isActiveDay(dayOfWeek: number, frequency: Frequency): boolean {
  switch (frequency) {
    case "daily":    return true;
    case "5x":       return dayOfWeek >= 1 && dayOfWeek <= 5; // Mon–Fri
    case "weekends": return dayOfWeek === 0 || dayOfWeek === 6;
    default:         return false;
  }
}

/**
 * Epoch-ms of the most recent block-time trigger at or before now, on an active
 * day per `frequency`. Walks back up to 7 days (enough to cover the most recent
 * active day for any frequency). Returns null if none.
 *
 * "Trigger" = a calendar day's blockTime occurrence (local hour:minute) that has
 * already passed and falls on an active day.
 */
export function mostRecentTriggerMs(
  blockTimeUtc: string,
  frequency: Frequency | null
): number | null {
  if (!frequency) return null;
  const { hour, minute } = getLocalBlockTime(blockTimeUtc);
  const now = new Date();
  for (let back = 0; back < 7; back++) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() > now.getTime()) continue; // occurrence still in the future (today, pre-block)
    if (!isActiveDay(d.getDay(), frequency)) continue;
    return d.getTime();
  }
  return null;
}

/**
 * Returns true if the shield should be active right now.
 *
 * Overnight-persistence model: the user is blocked from the moment a block
 * triggers until they complete a verified connection. A trigger counts only if
 * it happened AFTER `baselineMs` — the later of when the schedule was last
 * (re)configured and when the user last verified a connection. This means:
 *   • setting/relaunching before today's block time does NOT retroactively block;
 *   • a block persists across midnight (and inactive days) until a connection;
 *   • verifying a connection (advances baseline) lifts the block until the next trigger.
 */
export function isBlockTimeActive(
  blockTimeUtc: string,
  frequency: Frequency | null,
  baselineMs: number
): boolean {
  const trigger = mostRecentTriggerMs(blockTimeUtc, frequency);
  return trigger !== null && trigger > baselineMs;
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
