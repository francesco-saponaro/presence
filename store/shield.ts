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
  wasBypass?: boolean;
}

interface ShieldState {
  isBlocked: boolean;
  ocrFailCount: number;
  pendingConnections: PendingConnection[];
  /** ISO timestamp of the last verified connection. Part of the block
   *  "baseline" — a block trigger before this moment is already satisfied, so
   *  verifying lifts the block until the next trigger. */
  lastConnectionAt: string | null;
  setBlocked: (blocked: boolean) => void;
  incrementOcrFail: () => void;
  resetOcrFail: () => void;
  addPendingConnection: (
    timestamp: string,
    opts?: { contactId?: string | null; themeId?: string | null; wasBypass?: boolean },
  ) => void;
  markConnectionSynced: (timestamp: string) => void;
  setLastConnectionAt: (iso: string) => void;
}

export const useShieldStore = create<ShieldState>()(
  persist(
    (set) => ({
      isBlocked: false,
      ocrFailCount: 0,
      pendingConnections: [],
      lastConnectionAt: null,
      setBlocked: (isBlocked) => set({ isBlocked }),
      setLastConnectionAt: (lastConnectionAt) => set({ lastConnectionAt }),
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
