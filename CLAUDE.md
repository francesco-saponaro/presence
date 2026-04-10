# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start           # Start Expo dev server
npm run android     # Launch on Android emulator
npm run ios         # Launch on iOS simulator
npm run web         # Launch in browser
npm run lint        # Run ESLint
```

There is no test runner configured in this project.

## Architecture

This is a cross-platform mobile/web app built with **Expo Router** (file-based routing, similar to Next.js) and React Native, targeting iOS, Android, and web.

### Routing & Layouts

Expo Router maps the `app/` directory to routes:
- `app/_layout.tsx` — root layout: applies light/dark theme via React Navigation's `ThemeProvider`, wraps a `Stack` navigator
- `app/(tabs)/_layout.tsx` — tab group: defines bottom tab navigation with `HapticTab` for tactile feedback
- Files inside `(tabs)/` become tab screens; the `(tabs)` segment does not appear in URLs

### Theme System

All theme logic flows through three layers:
1. `constants/theme.ts` — `Colors` object with `light` and `dark` variants
2. `hooks/use-color-scheme.ts` — detects OS color scheme (has a `.web.ts` platform variant)
3. `hooks/use-theme-color.ts` — resolves a color from `Colors` based on current scheme; accepts optional `lightColor`/`darkColor` prop overrides

Components use `ThemedText` and `ThemedView` (in `components/`) which call `useThemeColor` internally.

### Platform-Specific Code

- Files ending in `.ios.tsx` / `.android.tsx` / `.web.ts` are loaded only on their respective platforms
- `components/ui/icon-symbol.ios.tsx` uses SF Symbols; the default `icon-symbol.tsx` falls back to Material Icons (`@expo/vector-icons`)
- Use `Platform.select()` or the `EXPO_OS` env var for runtime platform branching

### Key Configuration

- `app.json` — Expo config: React Compiler enabled, Typed Routes enabled, New Architecture enabled, web output is `static`
- `tsconfig.json` — strict mode, path alias `@/*` maps to project root
- ESLint uses the flat config format (`eslint.config.js`) with `eslint-config-expo`; auto-fix on save is configured in `.vscode/settings.json`
