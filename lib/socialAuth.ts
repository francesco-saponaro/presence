// import { supabase } from "@/lib/supabase";
// import { GoogleSignin } from "@react-native-google-signin/google-signin";
// import * as AppleAuthentication from "expo-apple-authentication";
// import { Platform } from "react-native";

// // Replace PLACEHOLDER values with real IDs from Google Cloud Console.
// // webClientId  → OAuth 2.0 → Web client (used by Supabase to validate tokens)
// // iosClientId  → OAuth 2.0 → iOS client
// GoogleSignin.configure({
//   webClientId:
//     "477480292838-5ovvpdscor002ah4rat6kcfdhtjlls1b.apps.googleusercontent.com",
//   iosClientId:
//     "477480292838-crt7tbqla5dtt3uosfefjvbc7lbebnk8.apps.googleusercontent.com",
// });

// export async function signInWithApple() {
//   if (Platform.OS !== "ios")
//     throw new Error("Apple Sign-In is only available on iOS.");

//   const credential = await AppleAuthentication.signInAsync({
//     requestedScopes: [
//       AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
//       AppleAuthentication.AppleAuthenticationScope.EMAIL,
//     ],
//   });

//   const { identityToken } = credential;
//   if (!identityToken)
//     throw new Error("Apple Sign-In did not return an identity token.");

//   return supabase.auth.signInWithIdToken({
//     provider: "apple",
//     token: identityToken,
//   });
// }

// export async function signInWithGoogle() {
//   await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
//   const userInfo = await GoogleSignin.signIn();
//   const idToken = userInfo.data?.idToken;
//   if (!idToken) throw new Error("Google Sign-In did not return an ID token.");

//   return supabase.auth.signInWithIdToken({
//     provider: "google",
//     token: idToken,
//   });
// }
