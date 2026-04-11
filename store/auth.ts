import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";
import type { Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  _hasHydrated: boolean;
  setSession: (session: Session | null) => void;
  setHasHydrated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      _hasHydrated: false,
      setSession: (session) => set({ session }),
      setHasHydrated: (val) => set({ _hasHydrated: val }),
    }),
    {
      name: "presence-auth",
      storage: createJSONStorage(() => storage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
