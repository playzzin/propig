const emptyFirebaseDefaults = { config: {} } as const;

if (typeof window !== 'undefined') {
  const globalScope = globalThis as typeof globalThis & {
    __FIREBASE_DEFAULTS__?: typeof emptyFirebaseDefaults;
  };

  globalScope.__FIREBASE_DEFAULTS__ ??= emptyFirebaseDefaults;
}

export {};
