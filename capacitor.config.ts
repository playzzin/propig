/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.propig.app',
  appName: 'propig',
  webDir: 'out',
  server: {
    url: 'https://propig-63524.firebaseapp.com/',
  },
  plugins: {
    FirebaseAuthentication: {
      authDomain: 'propig-63524.firebaseapp.com',
      providers: ['google.com'],
      skipNativeAuth: false,
    },
  },
};

export default config;
