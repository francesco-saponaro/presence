import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";

interface RoutineState {
  blockTimeUtc: string | null; // stored as UTC ISO string
  frequency: "daily" | "5x" | "weekends" | null;
  blockedApps: string[];
  setBlockTime: (utcIso: string) => void;
  setFrequency: (freq: RoutineState["frequency"]) => void;
  setBlockedApps: (apps: string[]) => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set) => ({
      blockTimeUtc: null,
      frequency: null,
      blockedApps: [],
      setBlockTime: (utcIso) => set({ blockTimeUtc: utcIso }),
      setFrequency: (frequency) => set({ frequency }),
      setBlockedApps: (blockedApps) => set({ blockedApps }),
    }),
    {
      name: "presence-routine",
      storage: createJSONStorage(() => storage),
    }
  )
);
