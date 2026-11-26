export const localFirebase = process.env.NEXT_PUBLIC_PROPIG_LOCAL_EMULATORS === 'true'
  ? {
      projectId: 'demo-propig-local',
      host: '127.0.0.1',
      authPort: 19099,
      firestorePort: 18080,
      storagePort: 19199,
      functionsPort: 15001,
    } as const
  : null;

if (localFirebase && (process.env.NODE_ENV !== 'development' ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== localFirebase.projectId)) {
  throw new Error('ProPig local emulators require development mode and project demo-propig-local.');
}

const emptyFirebaseDefaults = { config: {} } as const;

if (typeof window !== 'undefined') {
  const globalScope = globalThis as typeof globalThis & {
    __FIREBASE_DEFAULTS__?: typeof emptyFirebaseDefaults;
  };

  globalScope.__FIREBASE_DEFAULTS__ ??= emptyFirebaseDefaults;
}
