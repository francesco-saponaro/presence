import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface ShieldState {
  isBlocked: boolean;
  ocrFailCount: number;
  pendingConnections: { timestamp: string; synced: boolean }[];
  setBlocked: (blocked: boolean) => void;
  incrementOcrFail: () => void;
  resetOcrFail: () => void;
  addPendingConnection: (timestamp: string) => void;
  markConnectionSynced: (timestamp: string) => void;
}

export const useShieldStore = create<ShieldState>()(
  persist(
    (set) => ({
      isBlocked: false,
      ocrFailCount: 0,
      pendingConnections: [],
      setBlocked: (isBlocked) => set({ isBlocked }),
      incrementOcrFail: () => set((s) => ({ ocrFailCount: s.ocrFailCount + 1 })),
      resetOcrFail: () => set({ ocrFailCount: 0 }),
      addPendingConnection: (timestamp) =>
        set((s) => ({
          pendingConnections: [...s.pendingConnections, { timestamp, synced: false }],
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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
