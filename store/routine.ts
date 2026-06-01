import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface RoutineState {
  blockTimeUtc: string | null; // stored as UTC ISO string
  frequency: "daily" | "5x" | "weekends" | null;
  blockedApps: string[]; // bundle IDs (Android) or display metadata (iOS)
  /** iOS only: bundleId → display name map, persisted so the blocked-apps
   *  page can show app names without re-opening the picker. */
  blockedAppNames: Record<string, string>;
  /** iOS only: base64-encoded FamilyActivitySelection from FamilyActivityPicker.
   *  When set, applyShieldFromSelection() is used instead of applyShield(). */
  familyActivitySelection: string | null;
  /** ISO timestamp of when the schedule was last (re)configured. Used as part of
   *  the block "baseline": a block trigger before this moment does not count, so
   *  changing the time/frequency never retroactively blocks. */
  scheduleSetAt: string | null;
  setBlockTime: (utcIso: string) => void;
  setFrequency: (freq: RoutineState["frequency"]) => void;
  setBlockedApps: (apps: string[]) => void;
  setBlockedAppNames: (names: Record<string, string>) => void;
  setFamilyActivitySelection: (base64: string | null) => void;
  /** Set the schedule baseline timestamp (used for legacy migration when null). */
  setScheduleSetAt: (iso: string) => void;
  clearSchedule: () => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set) => ({
      blockTimeUtc: null,
      frequency: null,
      blockedApps: [],
      blockedAppNames: {},
      familyActivitySelection: null,
      scheduleSetAt: null,
      // Setting the time or frequency (re)configures the schedule → reset the
      // baseline so the change never blocks retroactively.
      setBlockTime: (utcIso) => set({ blockTimeUtc: utcIso, scheduleSetAt: new Date().toISOString() }),
      setFrequency: (frequency) => set({ frequency, scheduleSetAt: new Date().toISOString() }),
      setBlockedApps: (blockedApps) => set({ blockedApps }),
      setBlockedAppNames: (blockedAppNames) => set({ blockedAppNames }),
      setFamilyActivitySelection: (familyActivitySelection) => set({ familyActivitySelection }),
      setScheduleSetAt: (scheduleSetAt) => set({ scheduleSetAt }),
      clearSchedule: () => set({ blockTimeUtc: null, frequency: null, scheduleSetAt: null }),
    }),
    {
      name: "presence-routine",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
