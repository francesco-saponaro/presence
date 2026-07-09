/**
 * lib/ocr.ts
 *
 * OCR validation logic for connection-proof screenshots.
 *
 * Three STRICT rules (all must pass when a challenge is active):
 *   1. Effort         — more than 4 words of text exist in the screenshot
 *                       (catches blank / single-word junk uploads).
 *   2. Contact name   — the challenge contact's name (or, when no challenge,
 *                       any trusted contact's name) appears in the OCR text.
 *   3. Challenge word — the exact word the user was told to include appears
 *                       in the OCR text. Only enforced when a challenge is
 *                       active — the Phase 9 anti-cheat gate.
 *
 * When no `challenge` is passed (fallback — e.g. legacy state during migration
 * or a user with no contacts yet) we fall back to the pre-challenge behaviour
 * of "any contact name is fine".
 *
 * Screenshot age is checked upstream in `app/(tabs)/index.tsx` (iOS only) — it
 * reads PHAsset.creationDate metadata, not OCR text, so it lives with the
 * upload flow, not here.
 *
 * After two consecutive failures the UI shows a "Manual bypass" option.
 */

import type { Contact, ContactTheme } from "@/store/contacts";
import type { ActiveChallenge } from "@/store/shield";
import { OCRModule } from "./nativeModules";
import { ocrContainsWord } from "./blockChallenge";

export interface OCRValidationResult {
  valid: boolean;
  /** Short reason key for the failure toast lookup. */
  reason?:
    | "no_text"
    | "low_effort"
    | "no_contact_name"
    | "no_challenge_word"
    | "ocr_error"
    | "unavailable";
  /** Raw OCR text (for debugging; not shown to user). */
  rawText?: string;
  /** ID of the contact whose name was found in the text. */
  matchedContactId?: string;
  /** Display name of the matched contact — convenience for the UI. */
  matchedContactName?: string;
  /** ID of the theme tied to the satisfied challenge, if any. */
  matchedThemeId?: string;
  /** The challenge word that was satisfied (populated when `challenge` was
   *  passed AND the message contained the word). Written into the proof row. */
  matchedChallengeWord?: string;
  /** Set on `no_challenge_word` so the toast can name the required word. */
  requiredChallengeWord?: string;
  /** Set on `no_contact_name` when a challenge was active — so the toast can
   *  name the specific contact the user was supposed to text. */
  requiredContactName?: string;
}

// ── Strict rule 1: effort ────────────────────────────────────────────────────

const MIN_WORD_COUNT = 5;

// ── Contact-name lookup ──────────────────────────────────────────────────────

function nameHits(lower: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return lower.includes(n);
}

function findMentionedContacts(lower: string, contacts: Contact[]): Contact[] {
  return contacts.filter((c) => nameHits(lower, c.name));
}

// ── Core validator ───────────────────────────────────────────────────────────

/**
 * @param text        Raw OCR text.
 * @param contacts    Full contact list (used for the fallback path when no
 *                    challenge is active).
 * @param challenge   Currently-active block challenge, or null. When present,
 *                    the challenge contact + word become the strict gates.
 */
export function validateOCRText(
  text: string,
  contacts: Contact[] = [],
  challenge: ActiveChallenge | null = null,
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

  // ── Challenge path (Phase 9 — the anti-cheat gate) ─────────────────────────
  if (challenge) {
    // STRICT 2 — the specific challenge contact must be mentioned.
    if (!nameHits(lower, challenge.contactName)) {
      return {
        valid: false,
        reason: "no_contact_name",
        rawText: text,
        requiredContactName: challenge.contactName,
      };
    }

    // STRICT 3 — the required word must appear.
    if (!ocrContainsWord(text, challenge.word)) {
      return {
        valid: false,
        reason: "no_challenge_word",
        rawText: text,
        matchedContactId: challenge.contactId,
        matchedContactName: challenge.contactName,
        requiredChallengeWord: challenge.word,
      };
    }

    return {
      valid: true,
      rawText: text,
      matchedContactId: challenge.contactId,
      matchedContactName: challenge.contactName,
      matchedThemeId: challenge.themeId ?? undefined,
      matchedChallengeWord: challenge.word,
    };
  }

  // ── Fallback path (no challenge active) ────────────────────────────────────
  // Permissive: no contacts configured → pass.
  if (contacts.length === 0) {
    return { valid: true, rawText: text };
  }
  const mentioned = findMentionedContacts(lower, contacts);
  if (mentioned.length === 0) {
    return { valid: false, reason: "no_contact_name", rawText: text };
  }

  const first = mentioned[0];
  return {
    valid: true,
    rawText: text,
    matchedContactId: first.id,
    matchedContactName: first.name,
  };
}

// ── Unused: kept exported for backwards compatibility with any callers ──────
// (No one imports these directly today, but analytics might in the future.)
export type { ContactTheme };

// ── Full pipeline ─────────────────────────────────────────────────────────────

/**
 * Run native OCR on an image file and validate the extracted text.
 * Safe to call on web (returns valid:false with reason "unavailable").
 */
export async function runOCRValidation(
  imagePath: string,
  contacts: Contact[] = [],
  challenge: ActiveChallenge | null = null,
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
      console.log("[OCR] challenge:", challenge
        ? { contact: challenge.contactName, word: challenge.word }
        : "none");
    }
    const result = validateOCRText(text, contacts, challenge);
    if (__DEV__) {
      console.log("[OCR] validation result:", {
        valid: result.valid,
        reason: result.reason,
        matchedContact: result.matchedContactName,
        matchedThemeId: result.matchedThemeId,
        matchedChallengeWord: result.matchedChallengeWord,
      });
    }
    return result;
  } catch (err) {
    if (__DEV__) console.warn("[OCR] native recognizeText threw:", err);
    return { valid: false, reason: "ocr_error" };
  }
}
