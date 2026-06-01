/**
 * lib/contactsSync.ts
 *
 * CRUD + theme regeneration for `public.contacts` and `public.contact_themes`.
 *
 * Pattern: Zustand is the source of truth for the running session (so the UI
 * stays responsive and offline writes don't block). Supabase is a best-effort
 * mirror written fire-and-forget — same approach as the routine sync.
 *
 * Theme regeneration is the only call that must round-trip to the server
 * (OpenAI lives in the edge function), so it's awaitable.
 */

import i18n from "@/i18n";
import { supabase } from "./supabase";
import { useContactsStore, type Contact, type ContactTheme } from "@/store/contacts";
import { useRoutineStore } from "@/store/routine";
import { uuidv4 } from "./uuid";
import { scheduleWarmupNotification } from "./notifications";

export interface ContactAnswers {
  howKnown?: string | null;
  caresAbout?: string | null;
  appreciate?: string | null;
  wantToSay?: string | null;
}

export interface CreateContactInput extends ContactAnswers {
  name: string;
}

interface ThemeRow {
  id: string;
  theme_text: string;
  keywords: string[] | null;
}

function normaliseAnswer(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Replace the literal `{name}` placeholder in a theme with the contact's
 * actual name. Themes are stored in placeholder form so the same string can
 * be reused across notifications, previews, and analytics without storing
 * redundant name copies.
 */
export function composeThemeWithName(themeText: string, name: string): string {
  if (!themeText) return themeText;
  return themeText.replace(/\{name\}/gi, name);
}

/** Capitalises the first character. Used to render themes as standalone
 *  sentences (e.g. preview card, notification body). */
export function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rowToTheme(row: ThemeRow, contactId: string): ContactTheme {
  return {
    id: row.id,
    contactId,
    themeText: row.theme_text,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    usedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a contact locally and await the Supabase insert. The insert is
 * awaited (not fire-and-forget) because the typical caller — the onboarding
 * questions sheet — immediately follows with `regenerateThemes`, which reads
 * the row back via the edge function. Insert errors are logged but do not
 * throw; the local Zustand row still exists for offline use.
 */
export async function createContact(input: CreateContactInput): Promise<Contact> {
  const now = new Date().toISOString();
  const contact: Contact = {
    id: uuidv4(),
    name: input.name.trim(),
    howKnown: normaliseAnswer(input.howKnown),
    caresAbout: normaliseAnswer(input.caresAbout),
    appreciate: normaliseAnswer(input.appreciate),
    wantToSay: normaliseAnswer(input.wantToSay),
    themes: [],
    createdAt: now,
    updatedAt: now,
  };

  useContactsStore.getState().upsertContact(contact);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("contacts").insert({
        id: contact.id,
        user_id: user.id,
        name: contact.name,
        how_known: contact.howKnown,
        cares_about: contact.caresAbout,
        appreciate: contact.appreciate,
        want_to_say: contact.wantToSay,
      });
      if (error) {
        console.warn("[contactsSync] Insert failed (local row kept):", error.message);
      }
    }
  } catch (err) {
    console.warn("[contactsSync] Insert threw (local row kept):", err);
  }

  return contact;
}

/** Patch fields on an existing contact. */
export async function updateContact(
  id: string,
  patch: Partial<{ name: string } & ContactAnswers>,
): Promise<void> {
  const cleaned: Record<string, string | null> = {};
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.howKnown !== undefined) cleaned.how_known = normaliseAnswer(patch.howKnown);
  if (patch.caresAbout !== undefined) cleaned.cares_about = normaliseAnswer(patch.caresAbout);
  if (patch.appreciate !== undefined) cleaned.appreciate = normaliseAnswer(patch.appreciate);
  if (patch.wantToSay !== undefined) cleaned.want_to_say = normaliseAnswer(patch.wantToSay);

  // Map back to local store keys
  const localPatch: Partial<Contact> = {};
  if (patch.name !== undefined) localPatch.name = patch.name.trim();
  if (patch.howKnown !== undefined) localPatch.howKnown = normaliseAnswer(patch.howKnown);
  if (patch.caresAbout !== undefined) localPatch.caresAbout = normaliseAnswer(patch.caresAbout);
  if (patch.appreciate !== undefined) localPatch.appreciate = normaliseAnswer(patch.appreciate);
  if (patch.wantToSay !== undefined) localPatch.wantToSay = normaliseAnswer(patch.wantToSay);

  useContactsStore.getState().patchContact(id, localPatch);

  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("contacts").update(cleaned).eq("id", id).eq("user_id", user.id);
    } catch {
      // Best-effort.
    }
  })();
}

/** Delete a contact locally and on the server (cascades to themes). */
export async function deleteContact(id: string): Promise<void> {
  useContactsStore.getState().removeContact(id);
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("contacts").delete().eq("id", id).eq("user_id", user.id);
    } catch {
      // Best-effort.
    }
  })();
}

/**
 * Mark a theme as used (verified OCR match). Local Zustand is updated
 * immediately; Supabase UPDATE is fire-and-forget. The DB update is gated on
 * `used_at IS NULL` so concurrent matches don't overwrite the first-use
 * timestamp — same invariant the local store enforces.
 */
export async function markThemeUsedRemote(themeId: string): Promise<void> {
  const usedAtIso = new Date().toISOString();
  useContactsStore.getState().markThemeUsed(themeId, usedAtIso);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("contact_themes")
      .update({ used_at: usedAtIso })
      .eq("id", themeId)
      .eq("user_id", user.id)
      .is("used_at", null);
  } catch {
    // Best-effort. Local store already reflects the change.
  }
}

/**
 * Calls the generate-themes edge function. Throws on failure so the UI can
 * surface a toast — theme generation is a user-initiated action with visible
 * feedback, not a background sync.
 *
 * On success the local store is updated with the returned themes.
 */
export async function regenerateThemes(contactId: string): Promise<ContactTheme[]> {
  const { data, error } = await supabase.functions.invoke("generate-themes", {
    body: {
      contact_id: contactId,
      language: i18n.language || "en",
    },
  });

  if (error) throw error;

  const rows = (data as { themes?: ThemeRow[] } | null)?.themes;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No themes returned");
  }

  const themes = rows.map((row) => rowToTheme(row, contactId));
  useContactsStore.getState().setThemesForContact(contactId, themes);

  // Re-bake the warm-up notification body so the next fire reflects the new
  // theme content. No-op if no routine is configured yet.
  const { blockTimeUtc, frequency } = useRoutineStore.getState();
  if (blockTimeUtc && frequency) {
    scheduleWarmupNotification(blockTimeUtc, frequency).catch(() => {});
  }

  return themes;
}
