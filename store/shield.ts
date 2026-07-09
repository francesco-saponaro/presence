import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";

export interface PendingConnection {
  timestamp: string;
  synced: boolean;
  /** Optional — set for Phase 4+ verifications. Older persisted entries lack
   *  these fields; they sync to Supabase with null contact_id / theme_id. */
  contactId?: string | null;
  themeId?: string | null;
  /** Phase 9: the exact challenge word that unblocked this connection.
   *  Null for manual bypass or legacy verifications from before the challenge
   *  system landed. Used by analytics (word-bank progress) + rotation-avoid
   *  logic. */
  challengeWord?: string | null;
  wasBypass?: boolean;
}

/**
 * The active block challenge — one at a time per user. Assigned at block-trigger
 * time (or on-demand when the user opens home while blocked with no challenge
 * set), cleared on a successful verify. Mirrors the current active row in
 * public.block_challenges.
 */
export interface ActiveChallenge {
  /** Server-side row id for the block_challenges row (uuid). */
  id: string;
  contactId: string;
  contactName: string;
  themeId: string | null;
  themeText: string | null;
  word: string;
  assignedAt: string;
  /** True when the chosen theme had zero keywords and we re-used a previous
   *  challenge word. UI shows a nudge to regenerate prompts / change answers. */
  themesStale: boolean;
}

interface ShieldState {
  isBlocked: boolean;
  ocrFailCount: number;
  pendingConnections: PendingConnection[];
  /** ISO timestamp of the last verified connection. Part of the block
   *  "baseline" — a block trigger before this moment is already satisfied, so
   *  verifying lifts the block until the next trigger. */
  lastConnectionAt: string | null;
  /** Phase 9: currently-assigned block challenge (null when unblocked or when
   *  a challenge hasn't been assigned yet for the current cycle). */
  activeChallenge: ActiveChallenge | null;

  setBlocked: (blocked: boolean) => void;
  incrementOcrFail: () => void;
  resetOcrFail: () => void;
  addPendingConnection: (
    timestamp: string,
    opts?: {
      contactId?: string | null;
      themeId?: string | null;
      challengeWord?: string | null;
      wasBypass?: boolean;
    },
  ) => void;
  markConnectionSynced: (timestamp: string) => void;
  setLastConnectionAt: (iso: string) => void;
  setActiveChallenge: (challenge: ActiveChallenge | null) => void;
}

export const useShieldStore = create<ShieldState>()(
  persist(
    (set) => ({
      isBlocked: false,
      ocrFailCount: 0,
      pendingConnections: [],
      lastConnectionAt: null,
      activeChallenge: null,
      setBlocked: (isBlocked) => set({ isBlocked }),
      setLastConnectionAt: (lastConnectionAt) => set({ lastConnectionAt }),
      setActiveChallenge: (activeChallenge) => set({ activeChallenge }),
      incrementOcrFail: () => set((s) => ({ ocrFailCount: s.ocrFailCount + 1 })),
      resetOcrFail: () => set({ ocrFailCount: 0 }),
      addPendingConnection: (timestamp, opts) =>
        set((s) => ({
          pendingConnections: [
            ...s.pendingConnections,
            {
              timestamp,
              synced: false,
              contactId: opts?.contactId ?? null,
              themeId: opts?.themeId ?? null,
              challengeWord: opts?.challengeWord ?? null,
              wasBypass: opts?.wasBypass ?? false,
            },
          ],
        })),
      markConnectionSynced: (timestamp) =>
        set((s) => ({
          pendingConnections: s.pendingConnections.map((c) =>
            c.timestamp === timestamp ? { ...c, synced: true } : c
          ),
        })),
    }),
    {
      name: "presence-shield",
      storage: createJSONStorage(() => storage),
    }
  )
);
