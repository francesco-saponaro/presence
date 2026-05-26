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
  - **iOS:** Apple `FamilyControls`, `ManagedSettings`, `DeviceActivity`, Apple `Vision` framework (OCR), and SwiftUI `FamilyActivityPicker` (app selection). The picker is exposed as the `PresencePicker` native module (`native-src/PresencePicker.swift` + `native-src/PresencePicker.m`). Requires iOS 16+.
  - **iOS App Extension:** The `DeviceActivityMonitor` extension (`targets/PresenceMonitor/DeviceActivityMonitorExtension.swift`) is a separate Apple App Extension managed by `@bacons/apple-targets` (configured via `targets/PresenceMonitor/expo-target.config.js`). It runs out-of-process and applies/lifts the `ManagedSettingsStore` shield at the scheduled block time, even when the main app is closed.
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
4. **Native Swift Bridges — Two Separate Architectures (CRITICAL):** iOS native code is split across two distinct systems depending on whether the code runs in the main app process or as an App Extension.

   **A. Main app native modules** — `native-src/` → compiled into the main Presence app target via two plugins:
   - **`plugins/withSwiftFiles.js`** — copies `native-src/*.swift` and `native-src/*.m` to the `ios/` root directory (i.e. `ios/PresenceScreenTime.swift` etc.). This is the location the Xcode project file actually references for compilation.
   - **`plugins/withScreenTime.js`** — adds the files to the Xcode build target's Sources phase via `addSourceFile()`. Without this the files exist in `ios/` but are not compiled.
   - **CRITICAL:** The `modules/ios/` directory also contains Swift files but they are NOT compiled by Xcode — those are dead copies from an earlier architecture. Only edit `native-src/` files. Never edit `modules/ios/` Swift files expecting them to take effect.
   - To add a new native Swift file: (1) create it in `native-src/`, (2) add its filename to the `filesToCopy` array in both `withSwiftFiles.js` and `NATIVE_FILES` in `withScreenTime.js`, (3) create its `.m` ObjC bridge in `native-src/`, (4) expose it in `lib/nativeModules.ts`.

   **B. DeviceActivityMonitor App Extension** — `targets/PresenceMonitor/` → compiled as a separate iOS App Extension target managed by `@bacons/apple-targets`:
   - The extension file is `targets/PresenceMonitor/DeviceActivityMonitorExtension.swift` (class `DeviceActivityMonitorExtension: DeviceActivityMonitor`).
   - Its target metadata (type, name, entitlements, deployment target) lives in `targets/PresenceMonitor/expo-target.config.js`. Type is `"device-activity-monitor"`.
   - `@bacons/apple-targets` (listed in `app.json` `plugins`) reads every `targets/*/expo-target.config.js` and creates the Xcode extension target automatically during EAS prebuild. No manual Xcode editing needed.
   - This extension runs **out-of-process** — it has no RN bridge and cannot import React. It communicates with the main app exclusively via the shared App Group UserDefaults (`group.com.franciccio.presence`).
   - **Never** move `DeviceActivityMonitorExtension.swift` into `native-src/` or try to compile it via `withSwiftFiles.js` — the extension must be its own Xcode target, not part of the main app bundle.
5. **Native Module Bridging & Imports:** The project uses modern Expo where the New Architecture (newArchEnabled) is true by default. We are utilizing the interop layer for our custom native modules using the RCT_EXTERN_MODULE / RCT_EXTERN_METHOD ObjC bridge pattern. CRITICAL: Because of this, if a Swift file utilizes RCTPromiseResolveBlock or RCTPromiseRejectBlock, it MUST explicitly contain import React at the top of the Swift file, otherwise the EAS cloud compiler will fail.
6. **Zod v4 API:** This project uses Zod v4. The `errorMap` option is renamed to `error`. Use `z.literal(true, { error: "..." })` not `{ errorMap: ... }`.
7. **OAuth & Direct Sign-Up (Supabase):** Email confirmation must be **disabled** in the Supabase dashboard (`Auth > Providers > Email > Confirm email: OFF`) for direct sign-up to work. Apple uses `expo-apple-authentication` → `signInWithIdToken`. Google uses `signInWithOAuth` + `expo-web-browser` + `exchangeCodeForSession` (see Section 6A for full detail). The Apple button must only render on `Platform.OS === 'ios'`. Add `presence://` and `presence://auth/callback` to Supabase `Auth > URL Configuration > Redirect URLs`.
8. **TypeScript Asset Declarations (CRITICAL):**
   When importing local static images (PNG, JPG, SVG, etc.) into TypeScript files, TS will throw a TS2307: Cannot find module error by default. You must ensure an app.d.ts (or declarations.d.ts) file exists in the root directory (next to package.json) containing the following module declarations. Do not attempt to fix image import errors by changing the import path; fix it by declaring the module

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
- **OAuth Strategy (per provider):**
  - **Apple:** Use `expo-apple-authentication` (native Face ID / Touch ID popup, iOS only) → `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken })`. No nonce needed.
  - **Google:** Use `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })` + `WebBrowser.openAuthSessionAsync` (expo-web-browser). Build the redirect URI with `Linking.createURL(Platform.OS === 'ios' ? 'auth/callback' : '')`. On success, parse the `#access_token=...&refresh_token=...` hash fragment from the callback URL and call `supabase.auth.setSession({ access_token, refresh_token })` directly — do NOT call `exchangeCodeForSession` (that is PKCE-only and loses the code verifier in the mobile browser context). Do NOT set `flowType: 'pkce'` in the Supabase client — leave it at the default (implicit) so tokens are returned in the hash. Do NOT use `@react-native-google-signin/google-signin` — nonce mismatch errors make it unreliable with Supabase.
  - **CRITICAL — `signInWithGoogle` returns `void`:** The function throws on error and calls `setSession` internally. Callers must `await signInWithGoogle()` without destructuring — do NOT do `const { error } = await signInWithGoogle()` as this crashes (`undefined.error`).
  - Shared logic lives in `lib/socialAuth.ts`.
- Must include a text linking to TOS and Privacy Policy.
- Forgot Password (Supabase magic link/reset).
- Keep Splash Screen (`expo-splash-screen`) visible until Auth session and i18n are fully loaded.

#### Auth Routing Architecture (CRITICAL)

All post-auth navigation is centralised in two places — never scatter `router.replace` across screens:

1. **`lib/authRouting.ts` — `routeAfterAuth()`:** A plain function (no hooks) that reads Zustand state via `getState()` and calls `router.replace` to the correct screen. Logic: `!isOnboardingComplete` → step-N route, `!isSubscribed` → paywall, else → tabs. Import and call this wherever routing after auth is needed.

2. **`app/_layout.tsx` — `onAuthStateChange` handler:** The single global listener that drives all auth-triggered navigation:
   - `SIGNED_IN` → before routing, checks whether to wipe local state (see "New-user state reset" below), then calls `routeAfterAuth()`. This fires for **all** sign-in methods (email, Apple, Google) so screens do NOT need their own `router.replace` after auth succeeds.
   - `SIGNED_OUT` → calls `clearUser()` and routes to `/(auth)/login`. This is the only place that handles post-signout navigation.
   - `PASSWORD_RECOVERY` → early return (handled entirely in `reset-password.tsx`).
   - `INITIAL_SESSION` → no routing here; `index.tsx` handles cold-start routing via its `useEffect`.
   - **New-user state reset (CRITICAL):** On `SIGNED_IN`, the handler compares `session.user.created_at` and `session.user.id` against stored Zustand state to decide whether to wipe local onboarding/user data before routing:
     1. `isNewAccount` — `created_at` within the last 2 minutes → fresh signup → always call `resetOnboarding()` + `clearUser()` + `setSubscribed(false, null)`. Handles the "delete account from Supabase backend then re-register" case even when `userId` was already cleared to `null` by a prior `SIGNED_OUT`.
     2. `isDifferentUser` — stored `userId` is non-null and differs from the incoming session ID → different existing account on same device → same reset.
     This prevents a returning new user from landing mid-onboarding (or at the paywall) due to stale Zustand persisted state from a previous account.
   - **RevenueCat re-identification (CRITICAL):** After `setUser()`, the handler calls `identifyPurchasesUser()` then `checkEntitlement()` as a fire-and-forget background sync. If RC confirms an active entitlement it calls `setSubscribed(true, expiresAt)`. It intentionally does NOT set `false` on a negative result — subscription revocation is the server webhook's job. This is a positive-only signal used to restore state after reinstall or account switch.

3. **`app/index.tsx` — cold-start routing brain:** Waits for `authHydrated && onboardingHydrated`, then routes once based on stored state. Only relevant for `INITIAL_SESSION` (session restore on app launch). Does NOT fire for interactive sign-ins.

**Rules:**
- Login/signup screens must NOT call `router.replace` after social or email auth — `SIGNED_IN` handles it.
- `signOut` callers (profile, reset-password, etc.) must NOT call `router.replace` after `supabase.auth.signOut()` — the `SIGNED_OUT` event in `_layout.tsx` handles navigation. Calling it in both places causes a double navigation.
- Never add a `SIGNED_IN` routing branch to `index.tsx` — that would double-navigate since `index.tsx` is still mounted during the very first sign-in on cold start.

**`clearUser()` subscription state (CRITICAL):** `clearUser()` in `userStore` intentionally does NOT reset `isSubscribed` or `subscriptionExpiresAt`. This preserves subscription state across sign-out/sign-in for the same account. Only the `isNewAccount` / `isDifferentUser` branch in `_layout.tsx` explicitly calls `setSubscribed(false, null)` to wipe it for a fresh account. Never add `isSubscribed` back to `clearUser()` — it causes subscribed users to hit the paywall on every sign-in.

### B. The Psychological Onboarding Flow (Strict Order)

**Total: 9 steps.** The flow is emotionally engineered — each screen builds psychological pressure before releasing it at the paywall.

**File → Logical Step mapping** (filenames were not renamed to preserve routes):
- `step-1-hook` → Step 1, `step-2-reality` → Step 2, `step-3-shift` → Step 3
- `step-4-how` → Step 4 *(new)*, `step-4-goal` → Step 5, `step-6-contacts` → Step 6 *(new)*
- `step-5-apps` → Step 7, `step-6-permissions` → Step 8, `step-7-paywall` → Step 9

1. **The Hook** (`step-1-hook`) — Survey: "How does sending memes make you feel?" — **6 options:** Disconnected, Guilty, Numb, Nothing honestly, **Exhausted, Empty**. Tapping any option auto-advances. Uses Onboarding Image 1.

2. **The Reality Check** (`step-2-reality`) — Data projection graph + **3 stat cards** displayed prominently: **47** meaningless messages/week · **82** days/year staring at a screen · **13** years of their life gone to the feed. Uses Onboarding Image 2.

3. **The Paradigm Shift** (`step-3-shift`) — Dominant `text-4xl` serif headline with a tan accent divider for visual weight. New copy: *"Stop substituting memes for real conversations."* Uses Onboarding Image 3.

4. **How It Works** (`step-4-how`) — *New step.* Visual + text walkthrough of the core loop using 3 numbered cards: **Lock** (apps lock at your set time) → **Connect** (message a trusted contact) → **Screenshot** (capture the conversation — message AND date must be visible). Includes a warm tip callout: *"Make sure the screenshot is well-lit and easy to read."* Uses Onboarding Image 1 as a boilerplate placeholder — replace with a final asset.

5. **Block Time Setting** (`step-4-goal`) — Use `@react-native-community/datetimepicker` for time selection. **CRITICAL UI:** The picker must live inside a premium `@gorhom/bottom-sheet`. Copy frames it around the app's purpose: *"When should Presence protect you? Your apps lock at this time. You unlock them by reaching out to someone real."* Frequency selector: Daily, 5x, Weekends.

6. **Trusted Contacts** (`step-6-contacts`) — *New step.* User adds any number of people they commit to reaching out to (no upper limit). Implemented as a text input + "Add" button (no `expo-contacts` dependency — names are for psychological commitment and OCR validation, not technical lookup). Shows avatar-initial chips for each added contact with a remove button. Requires at least 1 contact to proceed. Stores names in `useRoutineStore` → `trustedContacts: string[]`.
   - Screen tells the user two things explicitly: (1) these names will be searched in their proof screenshots, and (2) they can add/remove contacts from their profile at any time.
   - **Profile management:** The Profile screen has a "Trusted Contacts" row in the Routine section. Tapping it opens a `BottomSheetModal` where contacts can be added or removed. Every change is immediately persisted to Zustand AND synced to Supabase via `lib/routineSync.ts → syncContactsToSupabase()`.
   - **Supabase:** `routines.trusted_contacts text[] not null default '{}'`. Run the migration comment in `supabase/schema.sql` on existing databases.

7. **App Selection** (`step-5-apps`) — **iOS:** Shows a "Choose Apps to Block" button that opens Apple's native `FamilyActivityPicker` (via the `PresencePicker` native module). The picker returns a base64-encoded `FamilyActivitySelection` and a list of `{ bundleId, name }` objects. The selection is stored in `routineStore.familyActivitySelection` (base64) and `routineStore.blockedApps` (bundle IDs for display/Android). **Android:** Shows a hardcoded list of social apps with checkboxes — package names stored in `blockedApps`. Requires at least 1 selection to proceed.

8. **Permissions** (`step-6-permissions`) — Four toggle rows: 1) Screen Time / Usage Access, 2) Notifications, 3) Activity Tracking, 4) Photo Library.
   - **Required vs optional:** Screen Time and Photo Library are **required** — the Continue button is blocked and a toast fires if either is missing. Notifications is **recommended** (soft warning toast on continue, but navigation proceeds). Activity Tracking is fully optional.
   - **Visual badges:** Required rows show a dark-brown `REQUIRED` pill; Notifications shows an outlined `RECOMMENDED` pill.
   - **Toggle-off guard:** Required permissions cannot be toggled off from within the app (the switch bounces back and shows an info toast). They can only be revoked in iOS/Android Settings.
   - **Permission detection on mount:** `checkCurrentStatus()` is called for all four permissions on mount via `useEffect` + `useCallback` so the switches reflect the real OS state immediately. An `AppState` listener re-runs the check whenever the app returns to foreground (handles Android deep-links to Settings).
   - **iOS FamilyControls re-request gotcha (CRITICAL):** On iOS 16+, `AuthorizationCenter.shared.requestAuthorization(for: .individual)` **throws** if called again after FamilyControls is already authorized. The `requestPermission` function therefore calls `requestAuthorization()` first; if it throws, it falls back to reading `getAuthorizationStatus()` to check whether it was already approved. `getAuthorizationStatus()` is implemented in `native-src/PresenceScreenTime.swift` (reads `AuthorizationCenter.shared.authorizationStatus`) and bridged in `native-src/PresenceScreenTime.m` — it requires an EAS build to take effect.
   - **iOS:** Routes to Apple's native prompt for `FamilyControls`, push notifications, and photo gallery access.
   - **Android (CRITICAL):** Routes to deep OS settings for `PACKAGE_USAGE_STATS` and `SYSTEM_ALERT_WINDOW`. Must also prompt to disable Battery Optimization (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). Use Lottie animations or GIFs to guide Android users through the OS screens.

9. **The Hard Paywall** (`step-7-paywall`) — Emotional headline (*"Your real life is waiting."*) + social proof line + **4 benefit rows** with checkmarks + price card. **No free trial.** CTA: *"Unlock Presence."* Yearly plan via RevenueCat. Must include "Restore Purchases", TOS, Privacy Policy links. Uses Onboarding Image 4.

### C. Main Dashboard (Bottom Tabs)

- **Tab 1 (Home):** Status indicator (Blocked/Unblocked). Countdown budget. Big "Upload Connection Proof" button when blocked.
- **Tab 2 (Analytics):** Genuine Connections Made, Current Streak, Time Reclaimed. Warm empty state illustration if stats are 0.
- **Tab 3 (Profile):** Routine section has three rows: **Schedule** (block time + frequency combined, navigates to `app/block-time.tsx`), **Blocked Apps** (navigates to `app/blocked-apps.tsx`), **Trusted Contacts** (opens `BottomSheetModal`). Language picker, Feedback/Contact button, Terms/Privacy links, Log Out/Delete Account.
  - **Schedule row** shows the current time and frequency as a combined value (e.g. "8:00 PM · Daily"). Navigating to `app/block-time.tsx` gives a full-screen settings page (no onboarding UI) with the same time card + frequency pills; tapping Save updates the store and syncs to Supabase.
  - **Blocked Apps row** navigates to `app/blocked-apps.tsx` — same iOS picker / Android checkbox flow as onboarding but as a standalone settings page. Save updates the store and syncs to Supabase.
  - **CRITICAL:** Profile never navigates into `(onboarding)` routes for post-onboarding users. Always use the dedicated settings pages.
  - Both `app/block-time.tsx` and `app/blocked-apps.tsx` are registered as root-level `<Stack.Screen>` entries in `app/_layout.tsx` so they slide in from the right as a standard push navigation.
  - **Trusted Contacts** opens a `BottomSheetModal` (`snapPoints: ["70%"]`) where contacts can be added (text input) or removed (×). Every change is immediately written to Zustand and synced to Supabase via `syncContactsToSupabase()`.
- **Footer:** Must include Copyright info, Logo, and "Manage Subscription" (RevenueCat customer portal).

### D. The Core Engine (Native OCR & Shield)

- **The Blocker (Cross-Platform):**
  - **iOS:** Uses `AuthorizationCenter.shared` (FamilyControls) and `ManagedSettingsStore` to apply native Shields. Shielding is triggered in two ways:
    - **Scheduled (out-of-process):** The `DeviceActivityMonitorExtension` (`targets/PresenceMonitor/DeviceActivityMonitorExtension.swift`) is an Apple App Extension managed by `@bacons/apple-targets`. The OS launches it at the scheduled block time via `DeviceActivitySchedule`, even when the main app is closed. It reads `familyActivitySelection`, `blockFrequency`, `blockHour`/`blockMinute`, `scheduleSetAt`, and `lastConnectionAt` from the shared App Group UserDefaults (`group.com.franciccio.presence`) and calls `ManagedSettingsStore` directly — no RN bridge involved.
    - **Overnight-persistence block model (CRITICAL):** A block persists from its trigger until the user completes a **verified connection** — it does NOT auto-lift at midnight, and it carries across inactive days. This is implemented by a **baseline** comparison shared by JS and the extension: the user is blocked iff the *most recent block trigger* (the latest blockTime occurrence on an active day, at or before now — `mostRecentTriggerMs` in `lib/timezone.ts` and the extension) is **later than** `baseline = max(scheduleSetAt, lastConnectionAt)`.
      - `scheduleSetAt` (routine store) resets whenever the time/frequency changes → reconfiguring never blocks retroactively, and setting an evening time in the morning does not block until that time arrives.
      - `lastConnectionAt` (shield store) advances on every verified connection → verifying lifts the block until the next trigger.
      - The extension's `intervalDidStart` applies the shield only if `trigger > baseline` (so it's safe even when DeviceActivity fires immediately on registration); `intervalDidEnd` is a **no-op** (no midnight auto-lift). The shield only clears via the main app's `clearShield()` on verification, which also writes a fresh `lastConnectionAt` to the App Group via `ScreenTimeModule.recordLastConnection(epochMs)`.
      - The `DeviceActivitySchedule` window is `blockTime → 23:59` (must NOT wrap past midnight, or DeviceActivity treats an early-morning "now" as inside the interval). Persistence past midnight comes from the no-op `intervalDidEnd`, not from a long window.
    - **On-demand (from main app):** `shieldEngine.ts` calls `ScreenTimeModule.applyShieldFromSelection(base64)` to shield immediately (e.g. when block time is changed or the app relaunches while blocked). **CRITICAL — App selection flow:**
    1. During onboarding (step 7) and from the profile "Blocked Apps" page, the user selects apps via Apple's `FamilyActivityPicker` UI (presented by the `PresencePicker` native module). This is the ONLY way to obtain valid `ApplicationToken`s — creating `Application(bundleIdentifier:)` directly always returns `token = nil`.
    2. The picker returns a base64-encoded `FamilyActivitySelection`. Stored in `routineStore.familyActivitySelection`.
    3. When shielding, `shieldEngine.ts` calls `ScreenTimeModule.applyShieldFromSelection(base64)` which decodes the selection and sets `store.shield.applications = selection.applicationTokens` — targeting only the user-chosen apps.
    4. If no `familyActivitySelection` is stored (legacy users / first install), the engine falls back to `applyShield(bundleIds)` which internally falls back to `store.shield.applicationCategories = .all()` when tokens are nil.
    5. `ManagedSettingsStore` operations are silently no-ops if FamilyControls authorization is not `.approved`. Always check `getAuthorizationStatus()` before applying a shield and re-request if needed.
  - **Shield overlay customisation (iOS):** The `PresenceShieldConfiguration` App Extension (`targets/PresenceShieldConfiguration/ShieldConfigurationExtension.swift`) overrides the default "App Restricted" text with a branded, friendly message: *"Time to connect."* and subtitle instructing the user to open Presence and share a screenshot. Managed by `@bacons/apple-targets` (type `"shield-config"`). The primary button label is "Open Presence" — without an additional ShieldAction extension, the system default action (opening Screen Time settings) applies.
  - **Screen Time auth re-request (CRITICAL — `denied` cannot be re-prompted):** `lib/shieldEngine.ts` exports `ensureScreenTimeAuth()` (called when the user saves a block time from `block-time.tsx` / `step-4-goal.tsx`) and re-checks auth on every foreground in `checkAndUpdateShield()`. The two revoked states behave very differently:
    - **`notDetermined`** — fresh install, OR the user turned **Screen Time off globally** (Settings → Screen Time → Turn Off). Here `requestAuthorization()` **can** re-show the native FamilyControls system modal, so the code calls it.
    - **`denied`** — the user toggled Screen Time off **for the Presence app specifically** (Settings → Presence → Screen Time off). iOS **permanently forbids** `requestAuthorization()` from re-showing the native modal in this state (same privacy rule as Camera / Photos / Location). No code can force the system dialog to reappear. The only recovery is `alertScreenTimeRevoked()` — a native `Alert.alert()` with "Open Settings" (deep-links to `app-settings:`) and "Not now" buttons, throttled once per app session (`_screenTimeAlertShown`; `force=true` from `ensureScreenTimeAuth` for immediate feedback on save).
    - **Event-driven detection:** `native-src/PresenceScreenTime.swift` is an `RCTEventEmitter` that subscribes to `AuthorizationCenter.shared.$authorizationStatus` (Combine) in `startObserving()` and emits `onScreenTimeAuthChanged` to JS. `startShieldEngine()` listens via `addScreenTimeAuthChangedListener()` so a status change is handled immediately (no stale-read race that AppState-foreground polling had). On `notDetermined` it calls `requestAuthorization()`; otherwise it re-runs `checkAndUpdateShield()`.
  - **Block time scheduling — 20-minute minimum window:** When the user saves a block time in `block-time.tsx` or `step-4-goal.tsx`, a toast immediately informs them whether the shield starts today or tomorrow. If the chosen time is less than 20 minutes in the future (or already past for today), the toast warns: *"Less than 20 minutes away — your shield will start tomorrow at [time]"* (8 s, position top). Otherwise it confirms today's start (5 s). The schedule is still saved — the native `DeviceActivitySchedule` repeats daily so it correctly fires tomorrow.
  - **Android:** Implements a foreground service using `UsageStatsManager` to detect blocked apps, and uses `WindowManager` (`SYSTEM_ALERT_WINDOW`) to draw a custom React Native "Shield" screen over the blocked app.
- **The Proof:** `expo-image-picker` passes the screenshot to the native modules.
  - **iOS:** Uses Apple `VNRecognizeTextRequest`.
  - **Android:** Uses Google `ML Kit Vision` API.
- **Validation Rules** (all implemented in `lib/ocr.ts → validateOCRText(text, trustedContacts)`):
  1. _Effort:_ Text block > 4 words.
  2. _Context:_ At least one messaging-app UI indicator present (bubbles, "Send", "Message", app names, etc.).
  3. _Recency:_ Timestamp indicates today or recent ("Today", current time, day name).
  4. _Contact name:_ At least one name from `trustedContacts` appears (case-insensitive) in the OCR text. **This is the key rule** — it enforces that the screenshot is from a conversation with one of the specific people the user committed to. Skipped if `trustedContacts` is empty (e.g. legacy users).
  - **The Relief Valve (CRITICAL UX):** If the OCR fails to verify a screenshot _twice in a row_, the UI must present a "Manual Bypass" button. If the user clicks this, allow them through the Shield (unblock apps) but log the bypass in Supabase. Do not trap a paying user out of their phone due to a vision glitch.
    -- **Result:** Success triggers haptics + unblocks Shield. Failure shows elegant toast ("We couldn't verify this connection...").
- **App Rating Strategy (CRITICAL):** Use `expo-store-review` to trigger the native App Store rating prompt. You must ONLY trigger this immediately after a successful OCR verification (while the user is in a high-dopamine state), and ONLY on the user's exactly 3rd lifetime successful connection. Do not spam them early on.

## 7. Backend & Services Integration

- **Supabase:** Schema must track user profiles, connection proof successes (stats), and selected routines. See `supabase/schema.sql` for the full schema. Edge functions live in `supabase/functions/`. The `routines` table has a `trusted_contacts text[] not null default '{}'` column — run the migration on existing databases: `alter table public.routines add column if not exists trusted_contacts text[] not null default '{}';`
- **`lib/routineSync.ts`:** Two helpers for writing routine data to Supabase: `syncRoutineToSupabase()` — full upsert of all routine fields (blockTime, frequency, apps, trustedContacts); `syncContactsToSupabase(contacts)` — targeted UPDATE of only `trusted_contacts`, falling back to a full upsert if no row exists yet. Call `syncContactsToSupabase` whenever contacts change (onboarding completion and profile edits).
- **`store/routine.ts` fields:**
  - `blockTimeUtc: string | null` — UTC ISO string encoding the local block hour (use `getLocalBlockTime()` from `lib/timezone.ts` to convert back for display/pickers).
  - `frequency: "daily" | "5x" | "weekends" | null`
  - `blockedApps: string[]` — bundle IDs (iOS display / Supabase sync) or package names (Android blocking).
  - `familyActivitySelection: string | null` — **iOS only.** Base64-encoded `FamilyActivitySelection` from `FamilyActivityPicker`. When present, `shieldEngine` calls `applyShieldFromSelection(base64)` instead of `applyShield(bundleIds)`. Never set this on Android.
  - `trustedContacts: string[]` — names for OCR validation and psychological commitment.
- **RevenueCat:** Handle paywall offerings, execute purchases, check entitlements. API keys are configured in `lib/purchases.ts`. The entitlement ID is `"premium"`. RevenueCat user is identified by Supabase user ID via `Purchases.logIn(userId)`.
- **Edge Functions:** Four functions deployed via `supabase functions deploy <name>`:
  - `delete-account` — admin-deletes the auth user (cascades all DB rows).
  - `revenuecat-webhook` — syncs subscription status from RevenueCat server events. Requires `REVENUECAT_WEBHOOK_SECRET` secret.
  - `welcome-email` — **currently disabled** (removed from paywall `handlePurchaseSuccess`). The function file remains deployed for future use. Requires `RESEND_API_KEY` and `FROM_EMAIL` secrets when re-enabled.
  - `contact` — routes in-app feedback via Resend. Requires `RESEND_API_KEY`, `FROM_EMAIL`, `SUPPORT_EMAIL` secrets. Production patterns applied: (1) CORS headers + OPTIONS preflight so it works from any client; (2) graceful `{ skipped: true }` response when `RESEND_API_KEY` is not set, preventing 500s in staging; (3) `reply_to: senderEmail` so support can reply directly to the user from the inbox; (4) try/catch around body parsing with a proper 400 response on malformed input; (5) HTML body with `white-space:pre-wrap` so multiline messages render correctly.
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
   - **Where to apply this:** 1. **The Hard Paywall (`step-7-paywall`, logical step 9):** `gestureEnabled: false` (no swipe — prevents bypassing the paywall), but DOES have a visible back chevron button so the user can return to step 8 (permissions). 2. **Onboarding step 1 (`step-1-hook`):** `gestureEnabled: false`, no back button — it's the entry point from auth, there is no previous slide. 3. **Onboarding steps 2–8:** `gestureEnabled: true` (swipe + back button). Each back handler calls `setCurrentStep(n-1)` then `router.back()`. 4. **The Shield Screen:** When the Shield is active, the user must not be able to swipe or press back to dismiss it and return to the blocked app.

6. **Subscription Enforcement:** The routing brain (`app/index.tsx`) checks `isSubscribed` from `useUserStore`. If `isOnboardingComplete && !isSubscribed`, the user is routed back to the paywall (handles lapsed subscriptions). This state is synced by both the RevenueCat webhook (server) and the local purchase flow.

## 10. Known Platform Constraints & Gotchas

These were discovered during development and must be respected:

1. **Apple FamilyControls — Entitlement & Provisioning Profile:**
   - The `com.apple.developer.family-controls` entitlement must be enabled in Apple Developer Portal under App Identifiers → Capabilities.
   - After enabling the capability, the EAS-cached provisioning profile will NOT include it. You must run `eas credentials --platform ios` to delete the cached profile, then rebuild — EAS will auto-generate a new profile that includes the entitlement.
   - Without the correct provisioning profile, `ManagedSettingsStore` shield calls are silently ignored at runtime (no error thrown).
   - FamilyControls **does** work in development builds once the provisioning profile includes the entitlement. The `ManagedSettingsStore` shield is active system-wide for the device.

2. **Windows Cannot Prebuild iOS:**
   - `npx expo prebuild --platform ios --clean` on Windows is silently skipped.
   - All iOS native compilation must go through EAS Cloud.
   - Android prebuilds work fine on Windows.

3. **Swift Files & React Imports:**
   - In the RCT_EXTERN_MODULE bridge pattern, React Native ObjC types are provided by the auto-generated bridging header.
   - HOWEVER, if you are explicitly using React Native types inside the Swift file itself (like RCTPromiseResolveBlock or RCTPromiseRejectBlock), you MUST add import React to the top of the Swift file.
   - The `DeviceActivityMonitorExtension` in `targets/PresenceMonitor/` is an App Extension — it has **no** RN bridge and must **never** import React or use any RN types.

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

18. **`@bacons/apple-targets` — Extension Provisioning Profile:**
   - `@bacons/apple-targets` generates a separate Xcode target for each `targets/*/expo-target.config.js`. Each target requires its own provisioning profile.
   - The `PresenceMonitor` extension uses the same `com.apple.developer.family-controls` entitlement and `group.com.franciccio.presence` App Group as the main app — both must be enabled in the Apple Developer Portal for the **extension's** App ID (`com.franciccio.presence.PresenceMonitor`), not just the main app's ID.
   - After adding or changing entitlements in `expo-target.config.js`, delete the cached EAS provisioning profiles (`eas credentials --platform ios`) and rebuild so EAS generates fresh profiles covering both the main app and the extension.
   - To edit the extension: modify `targets/PresenceMonitor/DeviceActivityMonitorExtension.swift` directly. The `expo-target.config.js` controls target metadata (type, entitlements, deployment target) — edit it to change those. Never touch the generated `ios/` folder.

19. **i18n Language Not Applied on Cold Start — Zustand Hydration Race (CRITICAL):**
   - `userStore` persists `language` and `languageSetByUser` to AsyncStorage via Zustand `persist`. AsyncStorage reads are **asynchronous**, so the store has not finished loading by the time the first `useEffect` fires in `_layout.tsx`.
   - A one-shot `useEffect(() => { ... }, [])` that reads `useUserStore.getState()` will see the in-memory initial defaults (`language: "en"`, `languageSetByUser: false`) instead of the persisted values. The language is never applied to i18n, and the app stays in whatever language `detectDeviceLanguage()` returned at module load — which may not match the user's stored preference.
   - **The fix:** `userStore` uses the same `_hasHydrated` + `onRehydrateStorage` pattern as `authStore` and `onboardingStore`. The language `useEffect` in `_layout.tsx` depends on `userHydrated` so it only runs after AsyncStorage has finished loading:
     - If `languageSetByUser: true` → `i18n.changeLanguage(language)` (explicit user choice wins).
     - If `languageSetByUser: false` → sync `userStore.language` to i18n's device-detected language so the profile picker always shows the real active language without the user needing to manually select it.
   - **Never** read `userStore` language state in a one-shot effect. Always gate on `_hasHydrated`.

11. **Onboarding Back Navigation — Always Guard with `router.canGoBack()`:**
   - On cold start, `index.tsx` routes directly to the persisted `currentStep`, meaning no navigation history exists. Calling `router.back()` on a screen with an empty stack throws `'GO_BACK' was not handled by any navigator`.
   - Every `handleBack()` in onboarding (steps 2–9) must use: `if (router.canGoBack()) router.back(); else router.replace("/(onboarding)/<previous-screen-filename>");`
   - The `replace` target is always the explicit route for the previous logical step. Remember that logical step numbers no longer match filenames (e.g. logical step 5 lives in `step-4-goal.tsx`). Always reference the actual filename in the replace call, not a computed step number.
   - This pattern applies to any multi-step flow where the user can re-enter mid-flow from a persisted state.

12. **FamilyControls `requestAuthorization` Throws When Already Authorized:**
   - On iOS 16+, calling `AuthorizationCenter.shared.requestAuthorization(for: .individual)` a second time after authorization has already been granted **throws an error** (it does not silently no-op).
   - Never call `requestAuthorization()` unconditionally when the user taps the Screen Time toggle. Always attempt it first (primary path) and fall back to `getAuthorizationStatus()` in the catch block to check whether it was already approved.
   - `getAuthorizationStatus()` reads `AuthorizationCenter.shared.authorizationStatus` synchronously (`.approved` / `.denied` / `.notDetermined`). It must be implemented in `native-src/PresenceScreenTime.swift` AND bridged via `RCT_EXTERN_METHOD` in `native-src/PresenceScreenTime.m`. Without the native build, the fallback also throws and the switch stays OFF — this is the expected behaviour until the next EAS build.
   - Similarly, `checkCurrentStatus()` on the permissions screen uses `getAuthorizationStatus()` on mount to pre-populate the switch as ON when FamilyControls was already granted. This also requires the EAS build.

13. **`@gorhom/bottom-sheet` — Keyboard, Scrolling & Input Rules (CRITICAL):**

   **Keyboard avoidance:**
   - Always use `BottomSheetTextInput` (from `@gorhom/bottom-sheet`) instead of React Native's `TextInput` inside any `BottomSheetModal` or `BottomSheetView`. Without it, the sheet has no awareness of input focus and keyboard avoidance never triggers regardless of `keyboardBehavior`.
   - `keyboardBehavior="extend"` — expands the sheet downward by the keyboard height, keeping it anchored at its snap point. Use this for sheets with text inputs where you don't want the sheet to move. Requires `BottomSheetTextInput` to work.
   - `keyboardBehavior="interactive"` — the sheet physically rides up with the keyboard. Use this for dynamic-height sheets (no `snapPoints`). With fixed snap points it overshoots because it tries to reach the snap point while also clearing the keyboard.
   - Always pair with `keyboardBlurBehavior="restore"` so the sheet snaps back when the keyboard is dismissed.
   - Always add `android_keyboardInputMode="adjustResize"` for correct Android behaviour.

   **Scrollable content inside a sheet:**
   - Use `BottomSheetFlatList` / `BottomSheetScrollView` (from `@gorhom/bottom-sheet`) — NOT React Native's `FlatList` / `ScrollView`. The gorhom versions register with the sheet's internal gesture handler so scroll and dismiss gestures don't conflict.
   - `BottomSheetFlatList` **must be the direct child** of `BottomSheetModal`. Wrapping it inside a `BottomSheetView` prevents gorhom from measuring content height, causing the sheet to open collapsed. Move any fixed header content into `ListHeaderComponent` instead.
   - For a sheet that needs both a fixed header/input area and a scrollable list, use `ListHeaderComponent` for the fixed part and `ListEmptyComponent` for the empty state — do not wrap the `BottomSheetFlatList` in anything.

   **Tap-through when keyboard is open:**
   - Add `keyboardShouldPersistTaps="handled"` to `BottomSheetFlatList` / `BottomSheetScrollView`. Without it, tapping a button (e.g. "Add") while the keyboard is open first dismisses the keyboard, consuming the tap — the button's `onPress` never fires and the user has to tap twice.

14. **`Application(bundleIdentifier:).token` Always Returns nil (CRITICAL):**
   - Creating an `Application` directly from a bundle ID (`Application(bundleIdentifier: "com.burbn.instagram")`) always produces an object whose `.token` is `nil`. This is by Apple's API design — the FamilyControls framework intentionally does not allow apps to shield other apps by looking up bundle IDs directly.
   - The **only** way to obtain valid `ApplicationToken`s is through `FamilyActivityPicker`. The picker returns a `FamilyActivitySelection` whose `.applicationTokens` is a `Set<ApplicationToken>` usable directly with `store.shield.applications`.
   - Therefore the `PresencePicker` native module (`native-src/PresencePicker.swift`) must be used for app selection on iOS. The JS-side checkbox list is Android-only.
   - `FamilyActivitySelection` conforms to `Codable` — encode with `JSONEncoder` → base64 string for Zustand storage, decode with `JSONDecoder` when applying the shield.

15. **`ManagedSettingsStore` is Silently a No-Op Without Authorization:**
   - Calling `store.shield.applications = tokens` or `store.shield.applicationCategories = .all()` has zero effect if `AuthorizationCenter.shared.authorizationStatus != .approved`. No error is thrown — the call just silently does nothing.
   - Always check `getAuthorizationStatus()` in `shieldEngine.ts` before applying a shield. If not approved, call `requestAuthorization()` first. This is already implemented in the fallback path of `activateNativeShield`.
   - The auth status is `.notDetermined` until the user goes through the Screen Time permissions step in onboarding. If the status is `.denied` (user toggled Screen Time off for Presence specifically in Settings), shielding is disabled AND the native modal can no longer be re-shown — the app must deep-link the user to Settings (see `alertScreenTimeRevoked()` in §6D). Turning Screen Time off *globally* instead resets to `.notDetermined`, which *can* be re-prompted.

16. **Presenting SwiftUI (`FamilyActivityPicker`) from React Native:**
   - `FamilyActivityPicker` is a SwiftUI view. To present it from a React Native native module, wrap it in a `UIHostingController` and present it modally on the main thread via `UIApplication.shared.connectedScenes`.
   - Use an `ObservableObject` view model to pass completion callbacks (`onDone`, `onCancel`) into the SwiftUI view, capturing `[weak hostingController]` to avoid retain cycles.
   - Always dispatch to `DispatchQueue.main.async` before any UIKit presentation.
   - Do NOT store `RCTPromiseResolveBlock`/`RCTPromiseRejectBlock` as class properties — capture them via closures instead to keep things thread-safe.
   - The `PresencePicker` module is in `native-src/PresencePicker.swift` + `native-src/PresencePicker.m`. Its JS wrapper is `PickerModule` in `lib/nativeModules.ts`. Call `PickerModule.show(initialBase64)` — pass the stored `familyActivitySelection` to pre-populate the picker on re-entry, or `null` on first launch.

17. **Password Reset Deep Link — Architecture (CRITICAL):**
   - In implicit flow (current default, no `flowType: 'pkce'`), Supabase redirects to: `presence://reset-password#access_token=...&refresh_token=...&type=recovery`
   - **Hash fragments are NOT exposed via `useLocalSearchParams`** — only `?query` params are. The tokens live in the `#` fragment.
   - **`Linking.useURL()` / `Linking.getInitialURL()` alone are unreliable** in screens mounted after Expo Router's navigation completes — by that point the URL event may have already been consumed.
   - **The working solution uses `lib/recoveryState.ts` as a bridge:**
     1. `_layout.tsx` (mounts first, before navigation) subscribes to `Linking.getInitialURL()` AND `Linking.addEventListener` in a `useEffect`. If the URL contains `reset-password` and `#`, it calls `storePendingResetUrl(url)`.
     2. `reset-password.tsx` calls `consumePendingResetUrl()` on mount (reads and clears the stored URL). It also tries `Linking.getInitialURL()` and `Linking.useURL()` as additional fallbacks, taking whichever is non-null first.
     3. Hash tokens are parsed, then `setInRecovery(true)` is set BEFORE calling `supabase.auth.setSession()`. This is critical — `setSession` fires `SIGNED_IN`, which `_layout.tsx` would otherwise handle by calling `routeAfterAuth()` and navigating away. The flag suppresses that routing.
     4. On `setSession` success: `setSessionReady(true)` directly (no `PASSWORD_RECOVERY` event dependency — timing is unreliable).
     5. PKCE fallback: if `?code=` param is present, `exchangeCodeForSession(code)` is called instead.
     6. Unmount cleanup: `setInRecovery(false)`. Also called explicitly in `onSubmit` before routing to login.
   - `detectSessionInUrl` has no effect on native — Supabase's JS client checks `isBrowser()` internally and skips URL detection on React Native. Keep it as `Platform.OS === "web"`.

## 11. Pre-Launch Checklist (Before App Store Submission)

These items must be completed before submitting to App Store / Play Store:

- [ ] **RevenueCat API keys:** Test keys set in `lib/purchases.ts`. Replace with production keys from the RevenueCat dashboard before submitting to stores.
- [ ] **RevenueCat entitlement:** Verify the entitlement ID `"premium"` matches what's configured in the RevenueCat dashboard.
- [ ] **Supabase Edge Functions deployed:** Run `supabase functions deploy` for all 4 functions.
- [ ] **Supabase secrets set:** `RESEND_API_KEY`, `FROM_EMAIL`, `SUPPORT_EMAIL`, `REVENUECAT_WEBHOOK_SECRET`.
- [ ] **RevenueCat webhook configured:** Point the RevenueCat webhook to `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`.
- [ ] **TOS/Privacy URLs:** Replace placeholder `https://presence.app/terms` and `https://presence.app/privacy` in `step-7-paywall.tsx` and `profile.tsx` with real hosted pages.
- [ ] **Apple FamilyControls production approval:** Wait for Apple approval; enable capability in Apple Developer Portal; delete cached EAS provisioning profile.
- [ ] **`expo-notifications` installed:** Run `npm install` after adding to `package.json`.
- [ ] **Supabase email confirmation:** Disable "Confirm email" in `Auth > Providers > Email` in the Supabase dashboard so users sign up directly without a verification email.
- [ ] **Supabase OAuth providers:** Enable Apple and Google providers in Supabase `Auth > Providers`. No redirect URL configuration needed (native `signInWithIdToken` flow, no browser redirect).
- [ ] **Google Sign-In client IDs:** Replace `PLACEHOLDER_WEB_CLIENT_ID` and `PLACEHOLDER_IOS_CLIENT_ID` in `lib/socialAuth.ts` and `app.json` with real values from Google Cloud Console (OAuth 2.0 Client IDs).
- [ ] **Supabase URL/keys:** Verify `lib/supabase.ts` has the production Supabase project URL and anon key.
- [ ] **Trusted contacts DB migration:** Run `alter table public.routines add column if not exists trusted_contacts text[] not null default '{}';` on the existing Supabase database before deploying.
- [ ] **Replace placeholder image in step-4-how:** `step-4-how.tsx` uses `onboarding-1.png` as a boilerplate. Replace with a dedicated final asset.
- [ ] **iOS blocked-apps picker requires EAS build:** The `PresencePicker` native module (`FamilyActivityPicker`) is compiled only during EAS builds. The "Choose Apps to Block" button in `step-5-apps.tsx` and `app/blocked-apps.tsx` will crash on a bare JS reload until a native build is installed. Always test blocked-app selection on an EAS development build.
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
