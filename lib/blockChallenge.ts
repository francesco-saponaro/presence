/**
 * lib/blockChallenge.ts
 *
 * Phase 9: gamified challenge system.
 *
 * At each block-trigger event, the app assigns ONE challenge word the user
 * must include in their real text message before the shield lifts. This is
 * the third strict OCR gate (along with contact-name match + screenshot age).
 *
 * A challenge = (contact, theme, word). Picked from the user's contact
 * rotation, then a single word is drawn from the chosen theme's keyword pool.
 *
 * Assignment triggers (see `shieldEngine.ts` + `notifications.ts` + `index.tsx`):
 *   1. Warm-up notification bake time (so the notification body matches Home).
 *   2. On-demand: user opens Home while blocked with no challenge assigned.
 *   3. Post-verify: cleared, next block trigger picks a new one.
 *
 * "Themes stale" fallback: if the chosen theme has zero keywords in its pool,
 * we re-use a previously-used challenge word for that contact and flip
 * `themesStale: true` on the challenge. Home + Contact editor render a nudge
 * ("regenerate prompts or change your answers to talk about something new").
 * If NO prior words exist for that contact either, we force a theme regen
 * silently before assigning.
 */

import { supabase } from "./supabase";
import { useShieldStore, type ActiveChallenge } from "@/store/shield";
import { useContactsStore, type Contact, type ContactTheme } from "@/store/contacts";
import { pickNextContact, pickNextTheme } from "./contactRotation";
import { regenerateThemes } from "./contactsSync";
import { uuidv4 } from "./uuid";

// How many of the most-recent challenge words for a given contact we avoid
// re-picking. Keeps the challenge rotating even inside a single theme.
const AVOID_LAST_N_WORDS = 2;

/**
 * Return the list of challenge words the user has recently been given for a
 * specific contact, most recent first. Drawn from local `pendingConnections`
 * — synced or not — so the avoidance survives an offline block cycle.
 */
function recentWordsForContact(contactId: string, limit = 5): string[] {
  const { pendingConnections } = useShieldStore.getState();
  const out: string[] = [];
  // Iterate newest → oldest.
  for (let i = pendingConnections.length - 1; i >= 0 && out.length < limit; i--) {
    const c = pendingConnections[i];
    if (c.contactId !== contactId) continue;
    if (!c.challengeWord) continue;
    out.push(c.challengeWord.toLowerCase());
  }
  return out;
}

/**
 * Pick one word from the theme's keyword pool, avoiding the last N words the
 * user has already been challenged with for this contact. Returns null when
 * the pool itself is empty.
 */
function pickChallengeWord(theme: ContactTheme, contactId: string): string | null {
  const pool = theme.keywords.filter((k) => typeof k === "string" && k.trim().length > 0);
  if (pool.length === 0) return null;

  const avoid = new Set(recentWordsForContact(contactId, AVOID_LAST_N_WORDS));
  const fresh = pool.filter((k) => !avoid.has(k.toLowerCase()));

  const source = fresh.length > 0 ? fresh : pool;
  return source[Math.floor(Math.random() * source.length)];
}

/**
 * Best-effort: mark any existing active row on the server as resolved so the
 * partial unique index `block_challenges_active_uniq` doesn't reject the new
 * insert. Called before every new assignment.
 */
async function resolveAllActiveOnServer(userId: string): Promise<void> {
  try {
    await supabase
      .from("block_challenges")
      .update({ resolved_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("resolved_at", null);
  } catch {
    // Best-effort. Insert may still succeed if there was no active row.
  }
}

/**
 * Assign a new challenge if none is currently active. Returns the resulting
 * ActiveChallenge (either the freshly-assigned one, the pre-existing one, or
 * null when no contacts are configured yet).
 *
 * Idempotent: repeatedly calling this without a verify in between is a no-op
 * unless `force: true` (used when the shield goes up on a new day).
 */
export async function assignChallengeIfNeeded(opts?: {
  force?: boolean;
}): Promise<ActiveChallenge | null> {
  const { activeChallenge, setActiveChallenge, pendingConnections } =
    useShieldStore.getState();

  if (activeChallenge && !opts?.force) return activeChallenge;

  const { contacts } = useContactsStore.getState();
  const contact = pickNextContact(contacts, pendingConnections);
  if (!contact) return null;

  // Try a theme in the normal way (unused first, then oldest-used).
  let theme = pickNextTheme(contact);
  let themesStale = false;
  let word: string | null = null;

  if (theme) {
    word = pickChallengeWord(theme, contact.id);
  }

  // Case 1: chosen theme has NO keywords at all. Fall back to a recently-used
  // word for that contact + nudge the user to regenerate.
  if (theme && !word) {
    themesStale = true;
    const prior = recentWordsForContact(contact.id, 20);
    if (prior.length > 0) {
      word = prior[Math.floor(Math.random() * prior.length)];
    }
  }

  // Case 2: contact has zero themes (or every theme has no keywords AND no
  // prior word exists). Try a silent regen; if it works, re-pick.
  if (!word) {
    try {
      const fresh = await regenerateThemes(contact.id);
      const nextContact = useContactsStore
        .getState()
        .contacts.find((c) => c.id === contact.id);
      const chosen = nextContact ? pickNextTheme(nextContact) : null;
      if (chosen) {
        theme = chosen;
        word = pickChallengeWord(chosen, contact.id);
        themesStale = false;
      } else if (fresh.length > 0 && fresh[0].keywords.length > 0) {
        theme = fresh[0];
        word = pickChallengeWord(fresh[0], contact.id);
        themesStale = false;
      }
    } catch {
      // Regen failed (offline / server error). Leave word=null so we return
      // null and the caller can decide whether to prompt the user.
    }
  }

  if (!word) return null;

  const now = new Date().toISOString();
  const challenge: ActiveChallenge = {
    id: uuidv4(),
    contactId: contact.id,
    contactName: contact.name,
    themeId: theme?.id ?? null,
    themeText: theme?.themeText ?? null,
    word: word.toLowerCase(),
    assignedAt: now,
    themesStale,
  };

  setActiveChallenge(challenge);

  // Mirror to Supabase (best-effort — local store is source of truth for the
  // running session, DB row is for cross-device and analytics history).
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await resolveAllActiveOnServer(user.id);
      await supabase.from("block_challenges").insert({
        id: challenge.id,
        user_id: user.id,
        contact_id: challenge.contactId,
        theme_id: challenge.themeId,
        challenge_word: challenge.word,
        assigned_at: challenge.assignedAt,
      });
    } catch {
      // Best-effort.
    }
  })();

  return challenge;
}

/**
 * Called from `onConnectionVerified` after a verify. Clears the local active
 * challenge and marks the corresponding server row resolved.
 *
 * The returned word (if any) is the challenge word that was satisfied — the
 * caller writes it into the connection_proofs row.
 */
export function resolveActiveChallenge(): {
  contactId: string | null;
  themeId: string | null;
  word: string | null;
} {
  const { activeChallenge, setActiveChallenge } = useShieldStore.getState();
  if (!activeChallenge) return { contactId: null, themeId: null, word: null };

  const snapshot = activeChallenge;
  setActiveChallenge(null);

  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("block_challenges")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", snapshot.id)
        .eq("user_id", user.id)
        .is("resolved_at", null);
    } catch {
      // Best-effort.
    }
  })();

  return {
    contactId: snapshot.contactId,
    themeId: snapshot.themeId,
    word: snapshot.word,
  };
}

/**
 * Case-insensitive substring check. Same shape used elsewhere in `lib/ocr.ts`.
 * Word-boundary aware on the left: "job" hits "job"/"jobs"/"jobless" but not
 * "subjob". Multi-word words (edge case) fall back to substring.
 */
export function ocrContainsWord(fullText: string, word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  const lower = fullText.toLowerCase();
  if (w.includes(" ")) return lower.includes(w);
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}`, "iu");
  return re.test(lower);
}

/**
 * Milestone thresholds for the achievements system. Front-loaded so users
 * get early wins after their first few connections.
 */
export const ACHIEVEMENT_MILESTONES: readonly number[] = [3, 7, 14, 30, 60, 100, 250];

/**
 * Return every unearned milestone the user has now crossed. Called on each
 * verified connection with the fresh lifetime count.
 */
export function newlyEarnedMilestones(
  lifetime: number,
  alreadyEarned: number[],
): number[] {
  const earnedSet = new Set(alreadyEarned);
  return ACHIEVEMENT_MILESTONES.filter((m) => lifetime >= m && !earnedSet.has(m));
}
