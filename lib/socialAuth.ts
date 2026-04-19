import { supabase } from "@/lib/supabase";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

// ── Apple Sign-In (native OS popup via expo-apple-authentication) ──────────────
export async function signInWithApple() {
  if (Platform.OS !== "ios")
    throw new Error("Apple Sign-In is only available on iOS.");

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const { identityToken } = credential;
  if (!identityToken)
    throw new Error("Apple Sign-In did not return an identity token.");

  return supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
  });
}

// ── Google Sign-In (web OAuth via expo-web-browser) ───────────────────────────
export async function signInWithGoogle() {
  const redirectUri = Linking.createURL(
    Platform.OS === "ios" ? "auth/callback" : "",
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) throw new Error(error?.message ?? "OAuth error");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  if (result.type === "success") {
    // Implicit flow returns tokens in the URL hash fragment (#access_token=...&refresh_token=...)
    const url = result.url;
    const hashIndex = url.indexOf("#");
    if (hashIndex !== -1) {
      const params = new URLSearchParams(url.slice(hashIndex + 1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        console.log(sessionError, "PKCE exchange error");
        return;
      }
    }
    // Fallback: try PKCE code exchange if hash parsing yields nothing
    const { error: sessionError } =
      await supabase.auth.exchangeCodeForSession(url);
    console.log(sessionError, "PKCE exchange error");
    if (sessionError) throw sessionError;
  }
}
