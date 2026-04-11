/**
 * Platform-aware key-value storage for Zustand persist middleware.
 *
 * - Native (iOS / Android): expo-secure-store  (encrypted keychain / keystore)
 * - Web:                     localStorage       (safe SSR guard included)
 *
 * Both surfaces satisfy the StateStorage interface expected by
 * `createJSONStorage()`, which wraps this with JSON serialisation.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

function sanitiseKey(key: string): string {
  // SecureStore keys: max 255 chars, alphanumeric + . _ -
  return key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

const nativeStorage: StateStorage = {
  getItem: (key) => SecureStore.getItemAsync(sanitiseKey(key)),
  setItem: (key, value) => SecureStore.setItemAsync(sanitiseKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(sanitiseKey(key)),
};

const webStorage: StateStorage = {
  getItem: (key) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

export const storage: StateStorage =
  Platform.OS === "web" ? webStorage : nativeStorage;
