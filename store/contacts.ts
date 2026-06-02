import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * One generated message idea for a contact. Phase 1 doesn't yet generate
 * themes (the UI doesn't collect the answers required by the edge function),
 * so `themes` will be empty for now — the shape is defined here so Phases 2-5
 * can build against it without rewriting state.
 */
export interface ContactTheme {
  id: string;
  contactId: string;
  themeText: string;
  /** Short lowercase tokens used to verify OCR text matches the theme. */
  keywords: string[];
  /** ISO timestamp; null = available for rotation, set when matched. */
  usedAt: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  /** Q1 — required at the UI level before themes can be generated. */
  howKnown: string | null;
  /** Q2 — required at the UI level before themes can be generated. */
  caresAbout: string | null;
  /** Q3 — optional. */
  appreciate: string | null;
  /** Q4 — optional. */
  wantToSay: string | null;
  themes: ContactTheme[];
  createdAt: string;
  updatedAt: string;
}

interface ContactsState {
  contacts: Contact[];

  /** Hydration flag — guard against the AsyncStorage race (gotcha #19). */
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  /** Insert if new (by id), otherwise replace fully. */
  upsertContact: (contact: Contact) => void;

  /** Patch fields on an existing contact. Bumps updatedAt. */
  patchContact: (id: string, patch: Partial<Omit<Contact, "id" | "createdAt">>) => void;

  removeContact: (id: string) => void;

  /** Replace the theme list for one contact (used after regeneration). */
  setThemesForContact: (contactId: string, themes: ContactTheme[]) => void;

  /** Mark a single theme as used (Phase 4 — OCR thematic match). */
  markThemeUsed: (themeId: string, usedAtIso?: string) => void;

  /** Wipe all contacts + themes. Called by the new-account branch in _layout.tsx. */
  clearAll: () => void;

  /** Replace the entire contact list. Used by pullContactsFromSupabase on
   *  sign-in to overwrite stale local data with the server's truth. */
  setContacts: (contacts: Contact[]) => void;
}

export const useContactsStore = create<ContactsState>()(
  persist(
    (set) => ({
      contacts: [],
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      upsertContact: (contact) =>
        set((state) => {
          const idx = state.contacts.findIndex((c) => c.id === contact.id);
          if (idx === -1) return { contacts: [...state.contacts, contact] };
          const next = state.contacts.slice();
          next[idx] = contact;
          return { contacts: next };
        }),

      patchContact: (id, patch) =>
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === id
              ? { ...c, ...patch, updatedAt: new Date().toISOString() }
              : c,
          ),
        })),

      removeContact: (id) =>
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        })),

      setThemesForContact: (contactId, themes) =>
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === contactId
              ? { ...c, themes, updatedAt: new Date().toISOString() }
              : c,
          ),
        })),

      markThemeUsed: (themeId, usedAtIso) =>
        set((state) => {
          const at = usedAtIso ?? new Date().toISOString();
          return {
            contacts: state.contacts.map((c) => ({
              ...c,
              themes: c.themes.map((t) =>
                t.id === themeId && t.usedAt === null ? { ...t, usedAt: at } : t,
              ),
            })),
          };
        }),

      clearAll: () => set({ contacts: [] }),

      setContacts: (contacts) => set({ contacts }),
    }),
    {
      name: "presence-contacts",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Convenience selector — the name list OCR uses today (Phase 1 keeps the
 *  existing name-only validation; Phase 4 will return per-contact themes). */
export function selectContactNames(state: { contacts: Contact[] }): string[] {
  return state.contacts.map((c) => c.name);
}
