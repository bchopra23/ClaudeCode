# The Chariot Control Panel

A private, offline-first habit tracker built around three rituals: a morning protocol checklist, an emergency urge-interception firewall, and a nightly self-audit. All data lives in on-device storage. No accounts, no network, no telemetry.

## Project layout

```
www/        The web app (PWA): index.html, compiled tailwind.css, manifest, service worker, icons
styles/     Tailwind input stylesheet
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

The stylesheet is compiled Tailwind, vendored at `www/tailwind.css`. After editing classes in `www/index.html`:

```sh
npm install
npm run build:css
```

## Building the Android app

The `android/` directory is a self-contained Gradle project. The web assets in `www/` are bundled into the APK automatically (the `app` module includes `../../www` as an asset source set), so there is nothing to copy by hand.

1. Open `android/` in Android Studio (Ladybug or newer). The IDE generates the Gradle wrapper on first sync. From the command line instead: `cd android && gradle wrapper && ./gradlew assembleDebug`.
2. Build and run on a device or emulator (minimum Android 8.0, API 26).
3. The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

Implementation notes:

- The page is served through `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/index.html`, which gives `localStorage` a stable secure origin (data persists across app updates).
- The manifest declares **no permissions** — not even `INTERNET`. The app is physically incapable of sending data anywhere.
- Launcher icons are vector adaptive icons; there are no binary image assets anywhere in the repository.
- `WebView.saveState`/`restoreState` preserve the session across configuration changes.

## Data model

Everything is stored in `localStorage` under `chariot_*` keys: audit logs (one per calendar day, upserted), the daily Morning Shield state, and firewall deployment telemetry (timestamps and hold durations, capped at 200 sessions). The in-app Export button downloads the full log as versioned JSON; Import merges a previous export, skipping duplicates.
