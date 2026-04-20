/**
 * lib/routineSync.ts
 *
 * Upserts the full routine (block time, frequency, blocked apps, trusted contacts)
 * from the local Zustand store to the Supabase `routines` table.
 *
 * Call this whenever any routine field changes from the profile screen,
 * and at the end of onboarding (after paywall success).
 */

import { supabase } from "./supabase";
import { useRoutineStore } from "@/store/routine";

/** Converts a UTC ISO string (as stored in Zustand) to a SQL `time` value (HH:MM:SS UTC). */
function toSqlTime(utcIso: string): string {
  const d = new Date(utcIso);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

export async function syncRoutineToSupabase(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { blockTimeUtc, frequency, blockedApps, trustedContacts } =
    useRoutineStore.getState();

  await supabase.from("routines").upsert(
    {
      user_id: user.id,
      block_time: blockTimeUtc ? toSqlTime(blockTimeUtc) : "20:00:00",
      frequency: frequency ?? "daily",
      blocked_apps: blockedApps,
      trusted_contacts: trustedContacts,
    },
    { onConflict: "user_id" }
  );
}

/**
 * Sync only the trusted_contacts field without touching other routine fields.
 * Uses UPDATE so it never creates a new row or overwrites unrelated columns.
 * Falls back to a full upsert if no routine row exists yet.
 */
export async function syncContactsToSupabase(contacts: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("routines")
    .update({ trusted_contacts: contacts })
    .eq("user_id", user.id);

  // If no row existed to update (new user who hasn't finished onboarding fully),
  // fall through to a full upsert.
  if (error) {
    await syncRoutineToSupabase();
  }
}
