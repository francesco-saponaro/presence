import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { SupportedStorage } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * expo-secure-store keys must be ≤ 255 chars and cannot contain certain
 * characters. Supabase auth keys can be longer, so we sanitise them.
 */
function sanitiseKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

/**
 * Native storage: expo-secure-store (encrypted keychain / keystore).
 */
const nativeStorage: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(sanitiseKey(key)),
  setItem: (key, value) => SecureStore.setItemAsync(sanitiseKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(sanitiseKey(key)),
};

/**
 * Web storage: a thin localStorage wrapper that guards against SSR/bundler
 * environments where `window` is not yet defined.
 */
const webStorage: SupportedStorage = {
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

const storage = Platform.OS === "web" ? webStorage : nativeStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
    flowType: "pkce",
  },
});
