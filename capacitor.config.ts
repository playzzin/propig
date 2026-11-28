/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.propig.app',
  appName: '그뚠앱',
  webDir: 'apps/mobile-shell',
  ios: { includePlugins: [] },
  server: {
    url: mobileOrigin(),
    appStartPath: '/propig',
    errorPath: 'propig/index.html',
  },
  plugins: {
    FirebaseAuthentication: {
      authDomain: 'propig-63524.firebaseapp.com',
      providers: ['google.com'],
      skipNativeAuth: false,
    },
  },
};

function mobileOrigin(): string {
  const origin = process.env.GEUTTUN_MOBILE_WEB_ORIGIN || 'https://propig-63524.firebaseapp.com';
  if (origin !== 'https://propig-63524.firebaseapp.com'
    && !/^https:\/\/propig-63524(?:--[a-z0-9-]+)?\.web\.app$/.test(origin)) {
    throw new Error('Choose the ProPig Firebase Hosting production or preview origin.');
  }
  return origin;
}

export default config;
