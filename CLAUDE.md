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
- Start Metro: `npx expo start`
- Build Environment (CRITICAL): Development is happening on Windows. DO NOT attempt to run local iOS builds (`npx expo run:ios`) or local prebuilds. All iOS native development builds (required for testing Screen Time/OCR on a physical device) will be compiled and uploaded manually by the user via Expo Cloud (EAS).

## 4. Strict Development Rules & Constraints

1. **Localization is Mandatory:** DO NOT hardcode any English text directly into React components. Every user-facing string must be wrapped in the `t()` function from `react-i18next`.
2. **Local Assets & Expo Image:** DO NOT use external URLs, Unsplash links, or standard RN `<Image>`. You MUST use `expo-image` and load the specific provided local files (e.g., `source={require('../assets/images/onboarding-1.png')}`). Ensure `contentFit="contain"` is used so backgrounds blend perfectly into the `#FAF7F2` or `#261B10` app backgrounds.
3. **No Confetti/Cheap UI:** Use heavy `@gorhom/bottom-sheet`, smooth premium transitions (`react-native-reanimated`), and glassmorphism (`expo-glass-effect`).
4. **Native Swift Bridges:** Provide the exact Swift code for bridging FamilyControls and Vision (OCR), along with the necessary Expo Config Plugin (e.g., `withScreenTime.js`) to inject entitlements into `Info.plist` and `.entitlements` during the prebuild phase.

## 5. UI/UX & Brand Guidelines (The "Cappuccino" Palette)

- **Light Mode:** Background `#FAF7F2` (Warm Milk). Surface/Cards `#EBE6DF`. Primary Text `#2A1800`.
- **Dark Mode:** Background `#261B10` (Deep Espresso). Surface/Cards `#3A2A1A`. Primary Text `#FDFBF7`.
- **Accents:** Tan (`#D6B588`), Greige (`#C6C0B9`), Medium Brown (`#705E46`), Dark Brown (`#422701`).
- **Presence Gradient:** `linear-gradient(135deg, #705E46 0%, #422701 100%)` (Use for Paywall and Shield screen).
- **Typography:** Primary Headings: **DM Serif Display** or **Fraunces**. Body/UI: **DM Sans** or **Outfit**.
- **Components:** Thick, chunky, pill-shaped buttons (fully rounded). Soft, diffuse, brown-tinted shadows (e.g., `rgba(66, 39, 1, 0.08)` in light mode). Thin borders (`1px solid #C6C0B9`) for cards.
- **Haptics:** Tie `expo-haptics` to major interactions (especially "Success" haptic on verification).
- **Toasts:** Use `react-native-toast-message` for all system feedback. Design custom toast layouts to match the Cappuccino palette (e.g., Tan background for success, Dark Brown for errors) instead of using the default generic toast styling.
- **Android Edge-to-Edge & Safe Areas (CRITICAL):** - The app must be fully edge-to-edge. Use `expo-navigation-bar` to make the Android system navigation bar transparent so the background color extends to the very bottom of the screen.
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
     - **Android(CRITICAL):** Routes the user to the deep OS settings to grant `PACKAGE_USAGE_STATS` (Usage Access) and `SYSTEM_ALERT_WINDOW` (Draw Over Other Apps), alongside standard notification/storage prompts. **You MUST also explicitly prompt the user to disable Battery Optimization (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`)**, otherwise Android will kill the background blocker service. **CRITICAL UI:** Because Android's permission screens are confusing, use clean Lottie animations or local GIFs above the toggles to visually show Android users exactly which OS buttons they need to press.
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

- **Supabase:** Schema must track user profiles, connection proof successes (stats), and selected routines.
- **RevenueCat:** Handle paywall offerings, execute purchases, check entitlements.
- **Edge Functions:** Secure webhook handler to receive RevenueCat events and sync active subscription status to the Supabase user profile.
- **Resend:** Implement Edge Functions to trigger a Welcome Email upon successful payment, and handle routing for the in-app Feedback/Contact form.
- **Expo Notifications:** Implement a highly intentional notification strategy:
  1. **The Warm-up:** Schedule a local push 15 minutes _before_ their target block time: "Your scroll shield goes up in 15 minutes. Who haven't you spoken to in a while?"
  2. **The Inactivity Prompt:** If the user hasn't successfully unlocked the shield in 48 hours: "It's been a few days. Take 2 minutes to ask a friend how they're doing."
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
