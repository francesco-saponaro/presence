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
  trustedContacts: string[]; // names of contacts the user commits to reaching out to
  setBlockTime: (utcIso: string) => void;
  setFrequency: (freq: RoutineState["frequency"]) => void;
  setBlockedApps: (apps: string[]) => void;
  setBlockedAppNames: (names: Record<string, string>) => void;
  setFamilyActivitySelection: (base64: string | null) => void;
  setTrustedContacts: (contacts: string[]) => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set) => ({
      blockTimeUtc: null,
      frequency: null,
      blockedApps: [],
      blockedAppNames: {},
      familyActivitySelection: null,
      trustedContacts: [],
      setBlockTime: (utcIso) => set({ blockTimeUtc: utcIso }),
      setFrequency: (frequency) => set({ frequency }),
      setBlockedApps: (blockedApps) => set({ blockedApps }),
      setBlockedAppNames: (blockedAppNames) => set({ blockedAppNames }),
      setFamilyActivitySelection: (familyActivitySelection) => set({ familyActivitySelection }),
      setTrustedContacts: (trustedContacts) => set({ trustedContacts }),
    }),
    {
      name: "presence-routine",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
