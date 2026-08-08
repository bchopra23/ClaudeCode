# The Chariot Control Panel

A private, offline-first habit tracker built around three rituals: a customisable morning protocol, an emergency urge-interception firewall, and a nightly self-audit. All data lives in on-device storage. No accounts, no network, no telemetry.

## The app

Four tabs, a bottom nav, and nothing that phones home.

- **Today** — streak ring with progress to the next milestone, the Morning Shield checklist (add, rename and remove your own rituals), one-tap "clean day" logging, and the Scientist Creed.
- **Firewall** — the emergency intercept. A configurable hold timer, a live breathing pacer (box / 4-7-8 / coherent), your own written *anchors* surfaced mid-urge, and a debrief that records how strong the wave was and whether you held. Intercept history and hold statistics live here too.
- **Log** — the nightly audit form (with an optional clarity rating and free-text triggers), plus the repository: search, filter by outcome, edit any entry, delete with undo.
- **Insights** — streaks, victory rate, a month-by-month battle map you can tap to log or review a day, an 8-week clean-rate chart, threat and reaction breakdowns, a clarity trend line, per-ritual adherence over 30 days, and milestone badges.

Settings (gear icon) covers accent colour, firewall duration, breathing pattern, haptics, discreet mode (blurs entry notes and slip labels until tapped), an exit guard on the intercept, and full backup/restore.

Keyboard shortcuts: `1`–`4` switch tabs, `f` deploys the firewall, `Esc` steps back out of any layer.

## Project layout

```
www/        The web app (PWA): index.html, app.js, compiled tailwind.css, manifest, service worker, icons
styles/     Tailwind input stylesheet — also holds the design system (tokens, components)
android/    Native Android wrapper (Kotlin + WebView via WebViewAssetLoader)
```

## Running the web app

The app is fully static. Serve `www/` with any static file server:

```sh
npx serve www
```

Opening `www/index.html` directly from disk also works (the service worker simply stays inactive on `file://`).

When served over HTTPS (or localhost), the app is an installable PWA: the service worker precaches everything, so it works fully offline after the first load.

## Rebuilding the CSS

The stylesheet is compiled Tailwind, vendored at `www/tailwind.css`. After editing classes in `www/index.html` or `www/app.js`:

```sh
npm install
npm run build:css
```

Accent colours are CSS custom properties (`--accent`, `--accent-soft`, `--accent-deep`) swapped by a `data-accent` attribute on `<html>`, so a new palette is a few lines in `styles/tailwind.css` plus an entry in the `ACCENTS` list in `www/app.js`.

## Building the Android app

The `android/` directory is a self-contained Gradle project. The web assets in `www/` are bundled into the APK automatically (the `app` module includes `../../www` as an asset source set), so there is nothing to copy by hand.

1. Open `android/` in Android Studio (Ladybug or newer). The IDE generates the Gradle wrapper on first sync. From the command line instead: `cd android && gradle wrapper && ./gradlew assembleDebug`.
2. Build and run on a device or emulator (minimum Android 8.0, API 26).
3. The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

Implementation notes:

- The page is served through `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/index.html`, which gives `localStorage` a stable secure origin (data persists across app updates).
- The app declares **no `INTERNET` permission** — it is physically incapable of sending data anywhere. The only permission it requests is `VIBRATE`, for haptic feedback (which can be switched off in Settings).
- The window is edge-to-edge (required from `targetSdk 35`). The activity measures the real system-bar insets and pushes them into the page as `--safe-top` / `--safe-bottom`, so the header and tab bar clear the status and navigation bars on every device. The soft keyboard resizes the WebView rather than covering it.
- The hardware back button is routed into the page: it closes the topmost dialog, intercept or sheet, then falls back to the Today tab, and only then leaves the app.
- Launcher icons are vector adaptive icons; there are no binary image assets anywhere in the repository.
- `WebView.saveState`/`restoreState` preserve the session across configuration changes.

## Data model

Everything is stored in `localStorage` under `chariot_*` keys:

| Key | Contents |
| --- | --- |
| `chariot_logs_v1` | Audit entries, one per calendar day (upserted) |
| `chariot_rituals_v1` | Morning Shield ritual definitions |
| `chariot_shield_v2` | Today's ritual completions |
| `chariot_shield_history_v1` | Per-day completions, pruned after ~400 days |
| `chariot_anchors_v1` | Personal anchors shown during an intercept |
| `chariot_settings_v1` | Accent, timer length, breathing pattern, toggles |
| `chariot_firewall_deploys_v1` | Lifetime deploy counter |
| `chariot_firewall_sessions_v1` | Intercepts: hold time, completion, intensity, outcome (last 200) |
| `chariot_active_firewall_v1` | An in-flight intercept, so it resumes if the app is killed mid-urge |

The v3 storage shape (`chariot_shield_v1`) migrates automatically on first launch.

**Export** downloads a versioned JSON backup containing every entry, ritual, anchor, intercept and preference. **Import** merges a backup: entries on a new date are added, duplicates skipped, rituals and anchors merged, preferences restored. Version 1 exports (logs only) still import cleanly.
