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
