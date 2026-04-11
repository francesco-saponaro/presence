import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";

interface UserState {
  userId: string | null;
  email: string | null;
  isSubscribed: boolean;
  subscriptionExpiresAt: string | null; // UTC ISO string
  lifetimeSuccessfulConnections: number;
  setUser: (userId: string, email: string) => void;
  setSubscribed: (isSubscribed: boolean, expiresAt?: string | null) => void;
  incrementConnections: () => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      email: null,
      isSubscribed: false,
      subscriptionExpiresAt: null,
      lifetimeSuccessfulConnections: 0,
      setUser: (userId, email) => set({ userId, email }),
      setSubscribed: (isSubscribed, expiresAt = null) =>
        set({ isSubscribed, subscriptionExpiresAt: expiresAt }),
      incrementConnections: () =>
        set((s) => ({
          lifetimeSuccessfulConnections: s.lifetimeSuccessfulConnections + 1,
        })),
      clearUser: () =>
        set({
          userId: null,
          email: null,
          isSubscribed: false,
          subscriptionExpiresAt: null,
          lifetimeSuccessfulConnections: 0,
        }),
    }),
    {
      name: "presence-user",
      storage: createJSONStorage(() => storage),
    }
  )
);
