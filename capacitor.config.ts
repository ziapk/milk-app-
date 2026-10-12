import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.doodhhisaab.app',
  appName: 'Doodh Hisaab',
  webDir: 'dist',
  // The live API is plain http (no domain/SSL yet), so the app must be allowed to call it.
  // Remove both once the API moves to https.
  server: { cleartext: true },
  android: { allowMixedContent: true },
};

export default config;
