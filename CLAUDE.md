# CLAUDE.md - Development Guide & Master Specification for "Presence"

## 1. Project Context & Mission

**App Name:** Presence
**Mission:** Replace mindless meme-sending and doomscrolling with actual genuine connection. The app blocks distractions at user-defined times until they reach out to someone real, verified via on-device OCR.
**Vibe:** Warm, human, modern, premium. Cures digital isolation.

## 2. Tech Stack & Architecture

- **Framework:** React Native / Expo (Development Builds required for native code).
- **Routing:** Expo Router (File-based routing).
- **Styling:** NativeWind (Tailwind CSS for React Native).
- **Backend & Auth:** Supabase (`@supabase/supabase-js`).
- **Payments:** RevenueCat (`react-native-purchases`).
- **State Management:** Zustand (Must use `persist` middleware with `expo-secure-store` or `AsyncStorage`).
- **Forms & Validation:** React Hook Form + Zod.
- **Forms & Inputs:** `@react-native-community/datetimepicker` (For native time selection).
- **Images:** `expo-image` (Required for all image rendering).
- **Alerts/Feedback:** `react-native-toast-message` (For all success, error, and info toasts).
- **Notifications:** `expo-notifications` (local push only — no Expo push server).
- **Native Modules (Cross-Platform):** Custom Swift (iOS) and Kotlin (Android) code injected via Expo Config Plugins.
  - **iOS:** Apple `FamilyControls`, `ManagedSettings`, `DeviceActivity`, and Apple `Vision` framework (OCR).
  - **Android:** `UsageStatsManager` (App detection), `SYSTEM_ALERT_WINDOW` (Overlay Shield), and Google `ML Kit Vision` (OCR).
- **i18n:** `react-i18next` natively supporting English (en), Spanish (es), French (fr), Italian (it), and Portuguese (pt).
- **App Rating:** `expo-store-review` (For strategic App Store rating prompts).
- **Transactional Emails:** Resend (for welcome emails upon payment and feedback/contact routing).
- **System UI (Android):** `expo-navigation-bar` and `expo-status-bar` (To control translucency and colors).
- **Safe Areas:** `react-native-safe-area-context` (Crucial for handling Android bottom insets).

## 3. Build & Dev Commands

- Install: `npm install`
- Type-check: `npx tsc --noEmit`
- Start Metro: `npx expo start`
- **Build Environment (CRITICAL):** Development is happening on **Windows**. DO NOT attempt to run local iOS builds (`npx expo run:ios`) or local prebuilds for iOS. All iOS native development builds will be compiled via EAS Cloud (`eas build --platform ios --profile development`). Android can be prebuilt locally: `npx expo prebuild --platform android --clean`.

## 4. Strict Development Rules & Constraints

1. **Localization is Mandatory:** DO NOT hardcode any English text directly into React components. Every user-facing string must be wrapped in the `t()` function from `react-i18next`. All 5 locale files (en, es, fr, it, pt) in `i18n/locales/` must be updated simultaneously.
2. **Local Assets & Expo Image:** DO NOT use external URLs, Unsplash links, or standard RN `<Image>`. You MUST use `expo-image` and load the specific provided local files (e.g., `source={require('../assets/images/onboarding-1.png')}`). Ensure `contentFit="contain"` is used so backgrounds blend perfectly into the `#FAF7F2` or `#261B10` app backgrounds.
3. **No Confetti/Cheap UI:** Use heavy `@gorhom/bottom-sheet`, smooth premium transitions (`react-native-reanimated`), and glassmorphism (`expo-glass-effect`).
4. **Native Swift Bridges:** The native-src Architecture (CRITICAL): DO NOT write any files directly into the ios/ or android/ directories. Because this is an Expo project developed on Windows, those folders are ephemeral, wiped frequently, and ignored by Git. ALL custom native code (.swift, .m, .kt, .java) MUST be placed in a root directory named native-src/. You must then write an Expo Config Plugin (e.g., plugins/withSwiftFiles.js) to manually copy these files into the native directories during the EAS prebuild phase.
5. **Native Module Bridging & Imports:** The project uses modern Expo where the New Architecture (newArchEnabled) is true by default. We are utilizing the interop layer for our custom native modules using the RCT_EXTERN_MODULE / RCT_EXTERN_METHOD ObjC bridge pattern. CRITICAL: Because of this, if a Swift file utilizes RCTPromiseResolveBlock or RCTPromiseRejectBlock, it MUST explicitly contain import React at the top of the Swift file, otherwise the EAS cloud compiler will fail.
6. **Zod v4 API:** This project uses Zod v4. The `errorMap` option is renamed to `error`. Use `z.literal(true, { error: "..." })` not `{ errorMap: ... }`.

## 5. UI/UX & Brand Guidelines (The "Cappuccino" Palette)

- **Light Mode:** Background `#FAF7F2` (Warm Milk). Surface/Cards `#EBE6DF`. Primary Text `#2A1800`.
- **Dark Mode:** Background `#261B10` (Deep Espresso). Surface/Cards `#3A2A1A`. Primary Text `#FDFBF7`.
- **Accents:** Tan (`#D6B588`), Greige (`#C6C0B9`), Medium Brown (`#705E46`), Dark Brown (`#422701`).
- **Presence Gradient:** `linear-gradient(135deg, #705E46 0%, #422701 100%)` (Use for Paywall and Shield screen).
- **Typography:** Primary Headings: **DM Serif Display** or **Fraunces**. Body/UI: **DM Sans** or **Outfit**.
- **Components:** Thick, chunky, pill-shaped buttons (fully rounded). Soft, diffuse, brown-tinted shadows (e.g., `rgba(66, 39, 1, 0.08)` in light mode). Thin borders (`1px solid #C6C0B9`) for cards.
- **Haptics:** Tie `expo-haptics` to major interactions (especially "Success" haptic on verification).
- **Toasts:** Use `react-native-toast-message` for all system feedback. Design custom toast layouts to match the Cappuccino palette (e.g., Tan background for success, Dark Brown for errors) instead of using the default generic toast styling.
- **Android Edge-to-Edge & Safe Areas (CRITICAL):** The app must be fully edge-to-edge. Use `expo-navigation-bar` to make the Android system navigation bar transparent so the background color extends to the very bottom of the screen.
  - You MUST use `useSafeAreaInsets` from `react-native-safe-area-context`. Any absolute-positioned bottom buttons or Bottom Sheets must have a padding/margin bottom of `insets.bottom + 20` to ensure they are never covered by the Android system navigation bar.

## 6. Core Features & App Flow

### A. Authentication

- Sign Up/Login (Email, Apple, Google).
- Must include a text linking to TOS and Privacy Policy.
- Forgot Password (Supabase magic link/reset).
- Keep Splash Screen (`expo-splash-screen`) visible until Auth session and i18n are fully loaded.

### B. The Psychological Onboarding Flow (Strict Order)

1. **The Hook:** Survey ("How does sending memes... make you feel?"). Uses Onboarding Image 1.
2. **The Reality Check:** Data projection graph (Result vs. Average). Uses Onboarding Image 2.
3. **The Paradigm Shift:** The pitch to replace the habit. Uses Onboarding Image 3.
4. **Goal Setting (Commitment):** - Use `@react-native-community/datetimepicker` for the time selection (e.g., 8:00 PM).
   - **CRITICAL UI:** Do not just render a raw picker on the screen. The picker must be presented inside a premium, beautifully styled `@gorhom/bottom-sheet` or a custom NativeWind card that matches the Cappuccino palette. It must feel like a deliberate, high-end interaction.
   - Frequency selector: Daily, 5x, Weekends.
5. **App Selection:** List of apps with checkboxes to apply the Shield.
6. **Permissions Hell (Handled Gracefully):** - **UI:** Four prominent toggle buttons requesting: 1) Screen Time / Usage Access, 2) Notifications, 3) Activity Tracking, 4) Photo Library.
   - **Cross-Platform Logic (What happens when toggled):**
     - **iOS:** Routes to Apple's native prompt for `FamilyControls`, push notifications, and photo gallery access.
     - **Android (CRITICAL):** Routes the user to the deep OS settings to grant `PACKAGE_USAGE_STATS` (Usage Access) and `SYSTEM_ALERT_WINDOW` (Draw Over Other Apps), alongside standard notification/storage prompts. **You MUST also explicitly prompt the user to disable Battery Optimization (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`)**, otherwise Android will kill the background blocker service. **CRITICAL UI:** Because Android's permission screens are confusing, use clean Lottie animations or local GIFs above the toggles to visually show Android users exactly which OS buttons they need to press.
7. **The Hard Paywall:** "Before vs. After" graph. Yearly plan via RevenueCat. Must include "Restore Purchases", TOS, Privacy Policy links. Uses Onboarding Image 4.

### C. Main Dashboard (Bottom Tabs)

- **Tab 1 (Home):** Status indicator (Blocked/Unblocked). Countdown budget. Big "Upload Connection Proof" button when blocked.
- **Tab 2 (Analytics):** Genuine Connections Made, Current Streak, Time Reclaimed. Warm empty state illustration if stats are 0.
- **Tab 3 (Profile):** Manage routine, blocked apps, Language picker, Feedback/Contact button, Terms/Privacy links, Log Out/Delete Account.
- **Footer:** Must include Copyright info, Logo, and "Manage Subscription" (RevenueCat customer portal).

### D. The Core Engine (Native OCR & Shield)

- **The Blocker (Cross-Platform):** - **iOS:** Use `AuthorizationCenter.shared` and `ManagedSettingsStore` to apply native Shields.
  - **Android:** Implement a foreground service using `UsageStatsManager` to detect blocked apps, and use `WindowManager` (`SYSTEM_ALERT_WINDOW`) to draw a custom React Native "Shield" screen over the blocked app.
- **The Proof:** `expo-image-picker` passes the screenshot to the native modules.
  - **iOS:** Uses Apple `VNRecognizeTextRequest`.
  - **Android:** Uses Google `ML Kit Vision` API.
- **Validation Rules:**
  1. _Context:_ Looks like a messaging app UI (bubbles, "Send", "Message").
  2. _Recency:_ Timestamp indicates today ("Today", current time).
  3. _Effort:_ Text block > 4 words. Do NOT look for specific keywords; verify substantial conversational text exists.
  - **The Relief Valve (CRITICAL UX):** If the OCR fails to verify a screenshot _twice in a row_, the UI must present a "Manual Bypass" button. If the user clicks this, allow them through the Shield (unblock apps) but log the bypass in Supabase. Do not trap a paying user out of their phone due to a vision glitch.
    -- **Result:** Success triggers haptics + unblocks Shield. Failure shows elegant toast ("We couldn't verify this connection...").
- **App Rating Strategy (CRITICAL):** Use `expo-store-review` to trigger the native App Store rating prompt. You must ONLY trigger this immediately after a successful OCR verification (while the user is in a high-dopamine state), and ONLY on the user's exactly 3rd lifetime successful connection. Do not spam them early on.

## 7. Backend & Services Integration

- **Supabase:** Schema must track user profiles, connection proof successes (stats), and selected routines. See `supabase/schema.sql` for the full schema. Edge functions live in `supabase/functions/`.
- **RevenueCat:** Handle paywall offerings, execute purchases, check entitlements. API keys are configured in `lib/purchases.ts`. The entitlement ID is `"premium"`. RevenueCat user is identified by Supabase user ID via `Purchases.logIn(userId)`.
- **Edge Functions:** Four functions deployed via `supabase functions deploy <name>`:
  - `delete-account` — admin-deletes the auth user (cascades all DB rows).
  - `revenuecat-webhook` — syncs subscription status from RevenueCat server events. Requires `REVENUECAT_WEBHOOK_SECRET` secret.
  - `welcome-email` — sends Resend welcome email on first purchase. Requires `RESEND_API_KEY` and `FROM_EMAIL` secrets.
  - `contact` — routes in-app feedback via Resend. Requires `RESEND_API_KEY`, `FROM_EMAIL`, `SUPPORT_EMAIL` secrets.
- **Resend:** Set secrets in Supabase: `supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="Presence <hello@presence.app>" SUPPORT_EMAIL="support@presence.app"`
- **Expo Notifications (local only):** Two notification types implemented in `lib/notifications.ts`:
  1. **Warm-up:** Fires 15 min before block time. Re-scheduled by `initNotifications()` on app start.
  2. **Inactivity:** Fires 48 h after last connection. Reset by `scheduleInactivityNotification()` in `onConnectionVerified()`.
- **App Rating Strategy:** Use `expo-store-review` to trigger the native App Store rating prompt. **CRITICAL:** Only trigger this immediately after a successful OCR verification (the highest dopamine moment), and only do it on the user's 3rd lifetime successful connection to avoid spamming them early on.

## 8. Copywriting & Tone Standards

- **The Persona:** The app acts as a strict but caring coach. The tone is empathetic, grounding, and firm.
- **Strict Adherence:** Follow the provided master copy exactly. Do not invent new features or text without permission.
- **Banned Tones:** DO NOT use overly enthusiastic, "tech-bro," or generic UI language. No exclamation points unless explicitly provided in the master copy.
- **The Core Focus:** Every piece of generated text (even error toasts or loading states) must focus on pulling the user out of the digital world and into reality.
- **Example Comparison:** - _Bad/Generic:_ "Please upload a photo to continue!"
  - _Good/Presence:_ "Replace meme sending with actual genuine connection. Text someone, upload the screenshot, and unlock your apps."

## 9. Edge Cases & State Management (CRITICAL ARCHITECTURE)

To ensure the app feels native, robust, and cheat-proof, you must implement the following edge-case handling:

1. **Timezone Management:** - Add `date-fns` or `dayjs` to the project.
   - All trigger times (e.g., 8:00 PM) must be stored in the Supabase database as UTC.
   - The app must calculate and execute the Shield triggers based on the user's _local_ device timezone to account for travel.

2. **Deep Linking (Auth):** - Configure Expo Router Deep Linking specifically for Supabase.
   - When a user clicks a Magic Link or Password Reset link in their email, the app must smoothly intercept the URL, authenticate the session, and route them to the Main Dashboard or Reset Password screen.

3. **AppState Listeners (Foreground/Background):**
   - Implement `AppState.addEventListener` from React Native.
   - When the app transitions from `background` to `active` (foreground), it must instantly verify if a Shield should be active or if the unblocked time budget has expired. Do not rely solely on component mount effects, as users will try to cheat the timer by leaving the app open in the background.

4. **Graceful Offline Handling:**
   - If a user completes the OCR validation while offline (e.g., on a subway), the app must still drop the Shield.
   - Use Zustand to cache the "Success" state and timestamp locally.
   - Implement a sync function that pushes this logged connection to the Supabase database the next time an active internet connection is detected.

5. **Navigation Interception (Anti-Cheat & Hard Stops):**
   - **iOS (Swipe Back):** You MUST set `gestureEnabled: false` in the Expo Router `<Stack.Screen>` options for critical screens to prevent users from simply swiping left-to-right to escape.
   - **Android (Hardware Back):** Implement React Native's `BackHandler` to intercept and disable the physical/system back button.
   - **Where to apply this:** 1. **The Hard Paywall:** Prevent backing out to access the app for free. 2. **Onboarding:** Prevent skipping crucial commitment steps. 3. **The Shield Screen:** When the Shield is active, the user must not be able to swipe or press back to dismiss it and return to the blocked app.

6. **Subscription Enforcement:** The routing brain (`app/index.tsx`) checks `isSubscribed` from `useUserStore`. If `isOnboardingComplete && !isSubscribed`, the user is routed back to the paywall (handles lapsed subscriptions). This state is synced by both the RevenueCat webhook (server) and the local purchase flow.

## 10. Known Platform Constraints & Gotchas

These were discovered during development and must be respected:

1. **Apple FamilyControls — Production Entitlement Required:**
   - The `com.apple.developer.family-controls` entitlement requires explicit approval from Apple for App Store distribution.
   - For development builds, enable the capability in Apple Developer Portal (App Identifiers → Capabilities) and delete the cached EAS provisioning profile via `eas credentials --platform ios`.
   - **Ad-hoc builds on Windows also cannot use the development FamilyControls entitlement** — only production-approved builds work. Wait for Apple's approval before testing FamilyControls on physical devices via ad-hoc distribution.

2. **Windows Cannot Prebuild iOS:**
   - `npx expo prebuild --platform ios --clean` on Windows is silently skipped.
   - All iOS native compilation must go through EAS Cloud.
   - Android prebuilds work fine on Windows.

3. **Swift Files & React Imports:**
   - In the RCT_EXTERN_MODULE bridge pattern, React Native ObjC types are provided by the auto-generated bridging header.
   - HOWEVER, if you are explicitly using React Native types inside the Swift file itself (like RCTPromiseResolveBlock or RCTPromiseRejectBlock), you MUST add import React to the top of the Swift file.

4. **`@available(iOS X)` at Class Level Breaks ObjC Bridge:**
   - Do NOT put `@available(iOS 16.0, *)` on the class — only put `guard #available(iOS 16.0, *)` inside individual methods that need it.

5. **Gradle `dependencies {}` Regex:**
   - When patching `build.gradle` via Config Plugin, regex `/dependencies\s*\{/` can match the buildscript block. Always target the `android {}` block's `dependencies` section specifically.

6. **`PostgrestFilterBuilder.catch()` Not Typed in TS:**
   - Do not chain `.catch()` on a Supabase query builder. Instead `await` the full query and destructure `{ error }`.

7. **Zod v4 API Changes:**
   - `errorMap` option renamed to `error` in Zod v4.
   - Use `z.literal(true, { error: "key" })` not `{ errorMap: ... }`.

8. **`supabase/functions/` Must Be Excluded from Root tsconfig:**
   - Edge Functions run on Deno. Node.js `tsc` does not know about `Deno` global or `jsr:` imports.
   - `tsconfig.json` `exclude` array must include `"supabase/functions"`.

9. **Android Overlay Shield Architecture:**
   - The `BlockerService` detects blocked apps via `UsageStatsManager` and broadcasts `com.franciccio.presence.SHOW_SHIELD`.
   - The JS layer receives this via `DeviceEventEmitter` and sets `isBlocked: true` in the shield store.
   - This brings the Presence app to the foreground (not a true `SYSTEM_ALERT_WINDOW` overlay). A native overlay Activity would require additional Kotlin code to draw over other apps without relying on the RN bridge being active.

10. **The Ephemeral Folders Trap:**

- Never instruct the user to "open Xcode" or "modify files in the ios/ folder."
- You must act as if the ios/ and android/ folders are completely invisible. Every single native modification (adding files, tweaking Info.plist, editing AndroidManifest.xml) must be done exclusively via Expo Config Plugins inside the app.json plugins array.

## 11. Pre-Launch Checklist (Before App Store Submission)

These items must be completed before submitting to App Store / Play Store:

- [ ] **RevenueCat API keys:** Replace `appl_XXXX` / `goog_XXXX` placeholders in `lib/purchases.ts` with real keys from the RevenueCat dashboard.
- [ ] **RevenueCat entitlement:** Verify the entitlement ID `"premium"` matches what's configured in the RevenueCat dashboard.
- [ ] **Supabase Edge Functions deployed:** Run `supabase functions deploy` for all 4 functions.
- [ ] **Supabase secrets set:** `RESEND_API_KEY`, `FROM_EMAIL`, `SUPPORT_EMAIL`, `REVENUECAT_WEBHOOK_SECRET`.
- [ ] **RevenueCat webhook configured:** Point the RevenueCat webhook to `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`.
- [ ] **TOS/Privacy URLs:** Replace placeholder `https://presence.app/terms` and `https://presence.app/privacy` in `step-7-paywall.tsx` and `profile.tsx` with real hosted pages.
- [ ] **Apple FamilyControls production approval:** Wait for Apple approval; enable capability in Apple Developer Portal; delete cached EAS provisioning profile.
- [ ] **`expo-notifications` installed:** Run `npm install` after adding to `package.json`.
- [ ] **Supabase URL/keys:** Verify `lib/supabase.ts` has the production Supabase project URL and anon key.
- [ ] **App Store assets:** Icon, screenshots, description, age rating, privacy nutrition labels.
- [ ] **Android Play Store:** Content rating questionnaire; privacy policy URL; target API level 34+.

## 12. Development Roadmap (Phased Approach)

**CRITICAL INSTRUCTION FOR CLAUDE:** Do NOT attempt to build the entire app at once. We are building this strictly phase-by-phase. When I ask you to execute a phase, you must ONLY write code for that specific phase and stop. Do not jump ahead.

- **[ ✅ DONE ] Phase 1: Foundation & Scaffolding** — Initialize Expo Router, basic folder structure, install dependencies, configure EAS development build.
- **[ ✅ DONE ] Phase 2: State & Navigation** — Set up Zustand (with secure-store/async-storage platform logic), Supabase client initialization, and bare-bones Expo Router navigation flow.
- **[ ✅ DONE ] Phase 3: UI & The "Cappuccino" Vibe** — Build the 7 Onboarding screens using NativeWind. Apply typography, colors, local `expo-image` assets, and the native bottom-sheet date picker. Initialize i18n in all 5 locales.
- **[ ✅ DONE ] Phase 4: Supabase Auth & Database Schema** — Build the Login/Signup flow. Create the Supabase DB schema for users, routines, and connection stats. Hook up the auth state to Zustand.
- **[ ✅ DONE ] Phase 5: The Core Engine (Native Modules & Timezones)** — Write the Expo Config Plugins and native Swift/Kotlin bridges for Screen Time, UsageStats, and ML Kit/Vision OCR. Implement Timezone management (`date-fns`) for local vs UTC triggers.
- **[ ✅ DONE ] Phase 6: The Main Dashboard & Offline Handling** — Build the Home, Analytics, and Profile tabs. Implement Graceful Offline Handling (cache OCR success locally and sync to Supabase when reconnected). Streak tracking. Language persistence.
- **[ ✅ DONE ] Phase 7: Monetization, Notifications & Polish** — RevenueCat paywall (real purchase flow). `expo-notifications` local push (warm-up + inactivity). Supabase Edge Functions (delete-account, revenuecat-webhook, welcome-email, contact). AppState background listeners. `expo-store-review` on 3rd connection.
