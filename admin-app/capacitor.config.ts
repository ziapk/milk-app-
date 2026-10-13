import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The admin app is a thin Android shell around the live dashboard, so dashboard changes
// reach the phone on the next deploy without a new APK.
// The dashboard address is set once, in the <meta name="admin-url"> tag of www/index.html
// (the offline page, which uses it for its "Try again" button).
const page = readFileSync(join(__dirname, 'www/index.html'), 'utf8');
const url = page.match(/name="admin-url" content="([^"]+)"/)[1];
const http = url.startsWith('http:');

const config: CapacitorConfig = {
  appId: 'com.moopartner.admin',
  appName: 'MooPartner Admin',
  webDir: 'www', // only shown when the server can't be reached (www/index.html)
  // The live server is plain http for now; these go away once it has https.
  server: { url, cleartext: http, errorPath: 'index.html' },
  android: { allowMixedContent: http },
};

export default config;
