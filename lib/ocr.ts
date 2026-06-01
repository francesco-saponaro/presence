/**
 * lib/ocr.ts
 *
 * OCR validation logic for connection-proof screenshots.
 *
 * Five rules (all must pass):
 *   1. Effort       — more than 4 words of text exist in the screenshot.
 *   2. Context      — at least one messaging-app UI indicator is present.
 *   3. Recency      — a time reference suggesting the conversation is recent.
 *   4. Contact name — at least one trusted contact name appears in the text.
 *   5. Thematic     — when the matched contact has generated themes, at least
 *                     one of those themes must have a keyword that appears in
 *                     the text. Skipped when the contact has no themes (e.g.
 *                     a legacy contact or a previously-failed generation).
 *
 * Rules 4 + 5 keep the user honest: they must screenshot a conversation with
 * a specific committed person AND touch on something we know matters to them.
 *
 * The matched contact's strongest-aligned theme is returned so the shield
 * engine can advance its `used_at` (Phase 4 rotation foundation).
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
    | "no_context_or_recency"
    | "no_recency"
    | "no_contact_name"
    | "no_theme_match"
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

// ── Rule 1: effort ───────────────────────────────────────────────────────────

const MIN_WORD_COUNT = 5;

// ── Rule 2: context (messaging UI) ──────────────────────────────────────────

const MESSAGING_SIGNALS = [
  "send",
  "sent",
  "message",
  "reply",
  "delivered",
  "read",
  "type a message",
  "imessage",
  "whatsapp",
  "messenger",
  "telegram",
  "signal",
  "dm",
  "chat",
  "typing",
  "online",
  "seen",
  "conversation",
];

// ── Rule 3: recency ───────────────────────────────────────────────────────────

const RECENCY_PATTERNS: RegExp[] = [
  /\bjust now\b/i,
  /\bnow\b/i,
  /\btoday\b/i,
  /\bmin(ute)?s?\s?ago\b/i,
  /\bhours?\s?ago\b/i,
  /\b(1[0-2]|0?[1-9]):[0-5]\d\s?(am|pm)\b/i, // 12-h clock
  /\b([01]\d|2[0-3]):[0-5]\d\b/, // 24-h clock
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\byesterday\b/i,
];

// ── Rule 4: contact-name lookup ──────────────────────────────────────────────

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

// ── Rule 5: thematic relevance ───────────────────────────────────────────────

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

  // Rule 1 – effort
  if (words.length < MIN_WORD_COUNT) {
    return { valid: false, reason: "low_effort", rawText: text };
  }

  // Rule 2 – context
  const hasContext = MESSAGING_SIGNALS.some((s) => lower.includes(s));

  // Rule 3 – recency
  const hasRecency = RECENCY_PATTERNS.some((re) => re.test(text));

  // Permissive OR: 20+ words AND at least one of context/recency → accept.
  const isLongConversation = words.length >= 20;

  if (!hasContext && !hasRecency) {
    return { valid: false, reason: "no_context_or_recency", rawText: text };
  }
  if (!hasRecency && !isLongConversation) {
    return { valid: false, reason: "no_recency", rawText: text };
  }

  // Rule 4 – contact name. No configured contacts → permissive pass (caller
  // handles the empty-contacts edge case at the routing level).
  if (contacts.length === 0) {
    return { valid: true, rawText: text };
  }

  const mentioned = findMentionedContacts(lower, contacts);
  if (mentioned.length === 0) {
    return { valid: false, reason: "no_contact_name", rawText: text };
  }

  // Rule 5 – thematic relevance.
  const match = pickMatch(mentioned, lower);
  if (!match) {
    // Shouldn't happen given mentioned.length > 0, but defensive.
    return { valid: false, reason: "no_contact_name", rawText: text };
  }

  const contactHasThemes = match.contact.themes.length > 0;
  const themeMatched = match.theme !== null;

  if (contactHasThemes && !themeMatched) {
    return {
      valid: false,
      reason: "no_theme_match",
      rawText: text,
      matchedContactId: match.contact.id,
      matchedContactName: match.contact.name,
    };
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
    const text = await OCRModule.recognizeText(imagePath);
    return validateOCRText(text, contacts);
  } catch {
    return { valid: false, reason: "ocr_error" };
  }
}
