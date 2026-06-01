/**
 * lib/contactRotation.ts
 *
 * Pure picker functions used by the warm-up notification scheduler (Phase 5)
 * and the analytics relationship view.
 *
 * Rotation rules (from the product brief):
 *   1. Always pick the contact whose last-connection is oldest (or who has
 *      never been connected with). Tiebreak by createdAt so the order is
 *      stable across renders.
 *   2. For that contact, prefer themes with `usedAt === null` (unused).
 *      If none remain, fall back to the theme with the oldest `usedAt`
 *      so the cycle keeps moving until regeneration catches up.
 *
 * The local `pendingConnections` array (from useShieldStore) is the source
 * of truth for "last connection" — pre-Phase-4 entries lack `contactId` and
 * are ignored for attribution purposes.
 */

import type { Contact, ContactTheme } from "@/store/contacts";
import type { PendingConnection } from "@/store/shield";

// Inlined to avoid a circular import via contactsSync — same logic as the
// `composeThemeWithName` / `capitaliseFirst` helpers exported there.
function fillName(themeText: string, name: string): string {
  return themeText ? themeText.replace(/\{name\}/gi, name) : themeText;
}
function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Most-recent ISO timestamp of any connection attributed to this contact,
 *  or null if no attributed connection exists locally. */
export function lastConnectionForContact(
  contactId: string,
  connections: PendingConnection[],
): string | null {
  let latest: string | null = null;
  for (const c of connections) {
    if (c.contactId !== contactId) continue;
    if (!latest || c.timestamp > latest) latest = c.timestamp;
  }
  return latest;
}

/**
 * Pick the next contact to surface in the warm-up nudge.
 * Returns null when the user has no contacts at all.
 */
export function pickNextContact(
  contacts: Contact[],
  connections: PendingConnection[],
): Contact | null {
  if (contacts.length === 0) return null;

  const scored = contacts.map((c) => {
    const iso = lastConnectionForContact(c.id, connections);
    return {
      contact: c,
      lastMs: iso ? new Date(iso).getTime() : 0,
      createdMs: new Date(c.createdAt).getTime(),
    };
  });

  scored.sort((a, b) => {
    if (a.lastMs !== b.lastMs) return a.lastMs - b.lastMs;
    return a.createdMs - b.createdMs;
  });

  return scored[0].contact;
}

/**
 * Pick the next theme for a contact: prefer unused, fall back to the
 * least-recently-used. Returns null when the contact has zero themes.
 */
export function pickNextTheme(contact: Contact): ContactTheme | null {
  if (contact.themes.length === 0) return null;

  const unused = contact.themes.filter((t) => t.usedAt === null);
  if (unused.length > 0) {
    return [...unused].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0];
  }

  // All used → recycle the one least-recently used.
  return [...contact.themes].sort((a, b) => {
    const aMs = a.usedAt ? new Date(a.usedAt).getTime() : 0;
    const bMs = b.usedAt ? new Date(b.usedAt).getTime() : 0;
    return aMs - bMs;
  })[0];
}

/**
 * Build the user-facing line for a given (contact, theme) pair, ready to drop
 * into a notification body or preview card:
 *   "ask {name} about his new job" → "Ask Marco about his new job."
 */
export function formatWarmupLine(contact: Contact, theme: ContactTheme): string {
  const filled = fillName(theme.themeText, contact.name).trim();
  if (!filled) return filled;
  const capped = capFirst(filled);
  return /[.!?]$/.test(capped) ? capped : capped + ".";
}
