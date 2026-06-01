/**
 * lib/routineSync.ts
 *
 * Upserts the routine (block time, frequency, blocked apps) from the local
 * Zustand store to the Supabase `routines` table.
 *
 * Trusted contacts moved to their own table in Phase 1 — see lib/contactsSync.ts.
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

  const { blockTimeUtc, frequency, blockedApps } = useRoutineStore.getState();

  await supabase.from("routines").upsert(
    {
      user_id: user.id,
      block_time: blockTimeUtc ? toSqlTime(blockTimeUtc) : "20:00:00",
      frequency: frequency ?? "daily",
      blocked_apps: blockedApps,
    },
    { onConflict: "user_id" }
  );
}
