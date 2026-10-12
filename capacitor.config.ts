import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.doodhhisaab.app',
  appName: 'Doodh Hisaab',
  webDir: 'dist',
  android: {
    // Only needed while testing against a plain-http server on your Wi-Fi (CAP_HTTP=1).
    // Production builds should talk to an https server and leave this off.
    allowMixedContent: process.env.CAP_HTTP === '1',
  },
};

export default config;
