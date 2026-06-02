/**
 * lib/ocr.ts
 *
 * OCR validation logic for connection-proof screenshots.
 *
 * Two STRICT rules (both must pass):
 *   1. Effort       — more than 4 words of text exist in the screenshot
 *                     (catches blank / single-word junk uploads).
 *   2. Contact name — at least one trusted contact's name (exact spelling)
 *                     appears in the OCR text. This is the anti-cheat gate.
 *
 * Two SOFT rules (informational; never fail verification):
 *   • Time presence — any `HH:MM` time-shape appears in the text. Used as
 *     a diagnostic signal but a missing time does NOT fail. We can't truly
 *     verify "today vs yesterday" via OCR anyway (same time-shape either
 *     way without a date marker), so we don't pretend to.
 *   • Thematic match — keyword overlap against the matched contact's
 *     themes. If any keyword hits, the strongest-scoring theme's `used_at`
 *     advances (drives rotation). Zero matches → verification still passes,
 *     no theme is credited for this connection. Keeps casual messages from
 *     getting wrongly rejected.
 *
 * Removed in this iteration: the English-only "messaging-app UI" word
 * check (send/message/etc.) and the multi-pattern recency check (today/
 * yesterday/weekday names/12-h clock) — both were English-anchored and
 * caused false negatives for users texting in other languages.
 *
 * After two consecutive failures the UI shows a "Manual bypass" option.
 */

import type { Contact, ContactTheme } from "@/store/contacts";
import { OCRModule } from "./nativeModules";

export interface OCRValidationResult {
  valid: boolean;
  /** Short reason key for the failure toast lookup. */
  reason?:
    | "no_text"
    | "low_effort"
    | "no_contact_name"
    | "ocr_error"
    | "unavailable";
  /** Raw OCR text (for debugging; not shown to user). */
  rawText?: string;
  /** ID of the contact whose name was found in the text (set even on
   *  `no_theme_match` so the UI can name them in the failure toast). */
  matchedContactId?: string;
  /** Display name of the matched contact — convenience for the UI. */
  matchedContactName?: string;
  /** ID of the strongest-aligned theme that justified the verification. */
  matchedThemeId?: string;
}

// ── Strict rule 1: effort ────────────────────────────────────────────────────

const MIN_WORD_COUNT = 5;

// ── Soft signal: language-agnostic time presence (HH:MM in 24-h shape).
//    Catches "11:42", "20:30", "08:15", etc. Used for diagnostics only; the
//    absence of a time does NOT fail verification.

const TIME_PATTERN = /\b([01]\d|2[0-3]):[0-5]\d\b/;

// ── Strict rule 2: contact-name lookup ───────────────────────────────────────

/**
 * Find the trusted contact whose name appears in the OCR text. When multiple
 * contacts are mentioned, we defer to the thematic step to pick a winner —
 * this just returns all candidates.
 */
function findMentionedContacts(
  lower: string,
  contacts: Contact[],
): Contact[] {
  return contacts.filter((c) => {
    const name = c.name.trim().toLowerCase();
    if (!name) return false;
    return lower.includes(name);
  });
}

// ── Soft signal: thematic relevance ──────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Loose keyword match: single-word keywords match by left-side word boundary
 * (so "job" matches "job", "jobs", "jobless" but not "subjob" or "lockjaw").
 * Multi-word keywords fall back to plain substring on the lowercased text.
 */
function keywordHits(keyword: string, fullLower: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  if (kw.includes(" ")) {
    return fullLower.includes(kw);
  }
  const re = new RegExp(`\\b${escapeRegex(kw)}`, "iu");
  return re.test(fullLower);
}

interface ThemeScore {
  theme: ContactTheme;
  hits: number;
}

function scoreThemes(themes: ContactTheme[], fullLower: string): ThemeScore[] {
  return themes
    .map((theme) => ({
      theme,
      hits: theme.keywords.reduce(
        (n, kw) => n + (keywordHits(kw, fullLower) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.hits - a.hits);
}

/**
 * Among mentioned contacts, pick the (contact, theme) pair with the strongest
 * theme keyword match. Returns `null` when no contact's themes have any
 * keyword hit — caller treats this as `no_theme_match`.
 *
 * Contacts with zero themes are passed through transparently: when none of
 * the mentioned contacts has themes at all, we return them with no theme so
 * the OCR still validates (legacy contacts shouldn't be punished).
 */
function pickMatch(
  mentioned: Contact[],
  fullLower: string,
): { contact: Contact; theme: ContactTheme | null } | null {
  if (mentioned.length === 0) return null;

  let best: { contact: Contact; theme: ContactTheme | null; hits: number } | null = null;
  let anyHasThemes = false;

  for (const contact of mentioned) {
    if (contact.themes.length === 0) continue;
    anyHasThemes = true;
    const scored = scoreThemes(contact.themes, fullLower);
    const top = scored[0];
    if (top.hits > 0 && (best === null || top.hits > best.hits)) {
      best = { contact, theme: top.theme, hits: top.hits };
    }
  }

  if (best) return { contact: best.contact, theme: best.theme };

  // None of the mentioned contacts have themes → permissive pass with the
  // first mentioned contact (legacy / gen-failure path).
  if (!anyHasThemes) {
    return { contact: mentioned[0], theme: null };
  }

  // Mentioned contacts have themes but none matched → caller fails with the
  // first mentioned contact so the toast can name them.
  return { contact: mentioned[0], theme: null };
}

// ── Core validator ───────────────────────────────────────────────────────────

export function validateOCRText(
  text: string,
  contacts: Contact[] = [],
): OCRValidationResult {
  if (!text || text.trim().length === 0) {
    return { valid: false, reason: "no_text", rawText: text };
  }

  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/);

  // STRICT 1 – effort. Filters blank / one-line junk uploads.
  if (words.length < MIN_WORD_COUNT) {
    return { valid: false, reason: "low_effort", rawText: text };
  }

  // STRICT 2 – contact name. No configured contacts → permissive pass
  // (caller handles the empty-contacts edge case at the routing level).
  if (contacts.length === 0) {
    return { valid: true, rawText: text };
  }
  const mentioned = findMentionedContacts(lower, contacts);
  if (mentioned.length === 0) {
    return { valid: false, reason: "no_contact_name", rawText: text };
  }

  // SOFT 1 – time presence (HH:MM). Diagnostic only; never fails.
  if (__DEV__) {
    const hasTime = TIME_PATTERN.test(text);
    console.log("[OCR] time present:", hasTime);
  }

  // SOFT 2 – thematic match. Score themes for rotation credit, but never
  // fail on a zero-match. The strongest-scoring theme (if any) advances
  // its used_at; otherwise no theme is credited for this connection.
  const match = pickMatch(mentioned, lower);
  if (!match) {
    // Defensive — pickMatch only returns null when mentioned.length === 0,
    // which we already guarded against above.
    return { valid: false, reason: "no_contact_name", rawText: text };
  }

  return {
    valid: true,
    rawText: text,
    matchedContactId: match.contact.id,
    matchedContactName: match.contact.name,
    matchedThemeId: match.theme?.id,
  };
}

// ── Full pipeline ─────────────────────────────────────────────────────────────

/**
 * Run native OCR on an image file and validate the extracted text.
 * Safe to call on web (returns valid:false with reason "unavailable").
 */
export async function runOCRValidation(
  imagePath: string,
  contacts: Contact[] = [],
): Promise<OCRValidationResult> {
  try {
    // The native iOS module uses UIImage(contentsOfFile:), which needs a bare
    // filesystem path. expo-image-picker hands us a "file:///var/mobile/..."
    // URL — strip the prefix before bridging so the native side can open it.
    const nativePath = imagePath.startsWith("file://")
      ? decodeURIComponent(imagePath.replace(/^file:\/\//, ""))
      : imagePath;
    if (__DEV__) console.log("[OCR] running recognizeText on:", nativePath);
    const text = await OCRModule.recognizeText(nativePath);
    if (__DEV__) {
      console.log("[OCR] raw text length:", text?.length ?? 0);
      console.log("[OCR] raw text preview:", text?.slice?.(0, 300));
      console.log("[OCR] contacts available:", contacts.map((c) => ({
        name: c.name,
        themeCount: c.themes?.length ?? 0,
      })));
    }
    const result = validateOCRText(text, contacts);
    if (__DEV__) {
      console.log("[OCR] validation result:", {
        valid: result.valid,
        reason: result.reason,
        matchedContact: result.matchedContactName,
        matchedThemeId: result.matchedThemeId,
      });
    }
    return result;
  } catch (err) {
    if (__DEV__) console.warn("[OCR] native recognizeText threw:", err);
    return { valid: false, reason: "ocr_error" };
  }
}
