import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";

interface UserState {
  userId: string | null;
  email: string | null;
  isSubscribed: boolean;
  subscriptionExpiresAt: string | null; // UTC ISO string
  lifetimeSuccessfulConnections: number;
  currentStreak: number;
  lastConnectionDate: string | null; // "YYYY-MM-DD" local date
  language: string; // persisted i18n locale code

  setUser: (userId: string, email: string) => void;
  setSubscribed: (isSubscribed: boolean, expiresAt?: string | null) => void;
  /**
   * Record one successful connection.
   * Always increments the lifetime counter.
   * Updates the day-streak (resets if last connection was > 1 day ago).
   */
  recordConnection: () => void;
  /** @deprecated use recordConnection instead */
  incrementConnections: () => void;
  setLanguage: (lang: string) => void;
  clearUser: () => void;
}

function todayString(): string {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      email: null,
      isSubscribed: false,
      subscriptionExpiresAt: null,
      lifetimeSuccessfulConnections: 0,
      currentStreak: 0,
      lastConnectionDate: null,
      language: "en",

      setUser: (userId, email) => set({ userId, email }),

      setSubscribed: (isSubscribed, expiresAt = null) =>
        set({ isSubscribed, subscriptionExpiresAt: expiresAt }),

      recordConnection: () =>
        set((s) => {
          const today = todayString();
          const last = s.lastConnectionDate;

          // Always increment the lifetime counter
          const newLifetime = s.lifetimeSuccessfulConnections + 1;

          // Only update streak once per calendar day
          if (last === today) {
            return { lifetimeSuccessfulConnections: newLifetime };
          }

          const newStreak =
            last === yesterdayString() ? s.currentStreak + 1 : 1;

          return {
            lifetimeSuccessfulConnections: newLifetime,
            currentStreak: newStreak,
            lastConnectionDate: today,
          };
        }),

      // Kept for backwards compatibility — delegates to recordConnection
      incrementConnections: () =>
        set((s) => ({
          lifetimeSuccessfulConnections: s.lifetimeSuccessfulConnections + 1,
        })),

      setLanguage: (language) => set({ language }),

      clearUser: () =>
        set({
          userId: null,
          email: null,
          isSubscribed: false,
          subscriptionExpiresAt: null,
          lifetimeSuccessfulConnections: 0,
          currentStreak: 0,
          lastConnectionDate: null,
          // language intentionally kept — it is a device-level preference
        }),
    }),
    {
      name: "presence-user",
      storage: createJSONStorage(() => storage),
    }
  )
);
