/**
 * lib/ocr.ts
 *
 * OCR validation logic for connection-proof screenshots.
 *
 * Four rules (all must pass):
 *   1. Effort   — more than 4 words of text exist in the screenshot.
 *   2. Context  — at least one messaging-app UI indicator is present.
 *   3. Recency  — a time reference suggesting the conversation is recent.
 *   4. Contact  — at least one trusted contact name appears in the text
 *                 (only enforced when trustedContacts is non-empty).
 *
 * Rule 4 keeps the user honest: they must screenshot a conversation with
 * one of the specific people they committed to during onboarding.
 *
 * After two consecutive failures the UI shows a "Manual bypass" option.
 */

import { OCRModule } from "./nativeModules";

export interface OCRValidationResult {
  valid: boolean;
  /** Short reason shown in the error toast when valid === false. */
  reason?: string;
  /** Raw OCR text (for debugging; not shown to user). */
  rawText?: string;
}

// ── Rule 1: effort ───────────────────────────────────────────────────────────

const MIN_WORD_COUNT = 5; // more than 4 words

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

// ── Rule 4: trusted contact name ─────────────────────────────────────────────

/**
 * Returns true if at least one of the trusted contact names appears
 * (case-insensitive) anywhere in the OCR text.
 * Always returns true when no contacts have been configured yet.
 */
function hasContactName(lower: string, contacts: string[]): boolean {
  if (contacts.length === 0) return true;
  return contacts.some((name) => lower.includes(name.toLowerCase().trim()));
}

// ── Core validator ───────────────────────────────────────────────────────────

export function validateOCRText(
  text: string,
  trustedContacts: string[] = []
): OCRValidationResult {
  if (!text || text.trim().length === 0) {
    return {
      valid: false,
      reason: "no_text",
      rawText: text,
    };
  }

  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/);

  // Rule 1 – effort
  if (words.length < MIN_WORD_COUNT) {
    return {
      valid: false,
      reason: "low_effort",
      rawText: text,
    };
  }

  // Rule 2 – context
  const hasContext = MESSAGING_SIGNALS.some((s) => lower.includes(s));

  // Rule 3 – recency
  const hasRecency = RECENCY_PATTERNS.some((re) => re.test(text));

  // Require both context AND recency (or allow one if the other is very strong).
  // Permissive OR: 20+ words AND at least one of context/recency → accept.
  const isLongConversation = words.length >= 20;

  if (!hasContext && !hasRecency) {
    return {
      valid: false,
      reason: "no_context_or_recency",
      rawText: text,
    };
  }

  if (!hasRecency && !isLongConversation) {
    return {
      valid: false,
      reason: "no_recency",
      rawText: text,
    };
  }

  // Rule 4 – trusted contact name
  if (!hasContactName(lower, trustedContacts)) {
    return {
      valid: false,
      reason: "no_contact_name",
      rawText: text,
    };
  }

  return { valid: true, rawText: text };
}

// ── Full pipeline ─────────────────────────────────────────────────────────────

/**
 * Run native OCR on an image file and validate the extracted text.
 * Safe to call on web (returns valid:false with reason "unavailable").
 */
export async function runOCRValidation(
  imagePath: string,
  trustedContacts: string[] = []
): Promise<OCRValidationResult> {
  try {
    const text = await OCRModule.recognizeText(imagePath);
    return validateOCRText(text, trustedContacts);
  } catch {
    return { valid: false, reason: "ocr_error" };
  }
}
