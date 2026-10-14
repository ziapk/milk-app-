# Doodh Hisaab

Milk delivery app: customers, daily milk, payment collection. Urdu/English, works offline, syncs to your own MySQL.

## Setup

```bash
# 1. Database
mysql -u root -p < server/schema.sql

# 2. Server (edit server/.env with your DB login)
cd server && npm install && npm run dev      # http://localhost:8000

# 3. App (in another terminal)
npm install && npm run dev                   # proxies /api to :8000
```

## Admin dashboard

Web dashboard for managing app users (distributors): overview stats and charts, search, user details,
block/unblock, unlock, reset PIN, log out phones, delete; plus adding/removing admins.

- **First admin:** set `ADMIN_USER` and `ADMIN_PASSWORD` in `server/.env`, then start the server. The account is
  created once, only while the `admins` table is empty. After that, add admins and change passwords in the dashboard.
- **Forgot the password / locked out:** `cd server && npm run create-admin -- <username> <new-password> [name]`
  (creates the admin, or resets that admin's password and lockout).
- **Dev:** `npm run admin` → http://localhost:5174/admin/ (talks to the server on :8000).
- **Production:** `npm run build` builds the app and the dashboard; the server serves it at `/admin`.

## Subscription billing (monthly app fee)

Partners pay a monthly fee per calendar month; admins record payments by hand (JazzCash, EasyPaisa, bank, cash)
on the dashboard's **Billing** page. Logic is in `server/billing.js`.

- **Fee per partner:** "Rs X from month M onward". Changing it never rewrites earlier months and replaces any change
  planned after M. New partners: the month they join is free, then the default fee from Billing settings.
  Existing partners start free; set each one's fee when you are ready.
- **Payments:** against a month; part payments add up, several months can be paid at once (advance), "Waived" marks
  a month paid without counting as income.
- **Unpaid:** a month is due on the 1st. After the grace days (default 7) the unpaid action applies: lock the app,
  read-only, or reminders only. Set the default in Billing settings; override it, or give extra time until a date,
  per partner (Rules). The app shows a reminder 5 days before and during the grace days.
- The app gets the status with every sync and applies it by date, so it also works offline. Data entered before a
  lock still syncs. Apps older than this release don't know about billing, so publish the new APK.

## Admin Android app

`admin-app/` is a separate Android app, **MooPartner Admin** (`com.moopartner.admin`), that opens the
admin dashboard from the server. Dashboard changes reach it on the next deploy; no new APK needed.

- Server address: the `admin-url` tag in `admin-app/www/index.html` (that file is also the offline screen).
- Build (Java 21): `npm run admin:apk` → `admin-app/android/app/build/outputs/apk/release/app-release.apk`
  (signed with the same key as the main app, from `android/keystore.properties`).
- Version: `admin-app/package.json`. Icons: `npm run icons` builds both apps' icons and splash screens.

## Production

`npm run build` in this folder, then run `npm start` in `server/`. Express serves the built app and the API on the same port; put Caddy/Nginx with HTTPS in front (needed for "Add to Home screen").

## Android APK

Built with Capacitor; the Android Studio project is in `android/`.

1. Put the API address in `.env.android` (`VITE_API_URL=...`).
   - Testing: your Mac's Wi-Fi IP, e.g. `http://192.168.10.10:8000/api` (phone on the same Wi-Fi, server running).
   - Release: your live **https** server, e.g. `https://milk.example.com/api`.
2. Build (needs Java 21 — Android Studio's bundled one works):
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   npm run apk
   ```
3. APK: `android/app/build/outputs/apk/debug/app-debug.apk` — copy to the phone (WhatsApp/USB) and install.

Debug builds allow plain `http` (see `android/app/src/debug/AndroidManifest.xml`); release builds require https.
For Play Store / sharing a signed APK, open `android/` in Android Studio → Build → Generate Signed App Bundle / APK.

All icons (web + Android launcher), the in-app logo (`public/logo.png`) and the Android splash screen are made from `public/moopartner-bike.png`: replace that image, then run `npm run icons`.
