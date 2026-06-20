import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { enableMultiTabIndexedDbPersistence, getFirestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

const initializeBrowserAuth = () => {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    return getAuth(app);
  }
};

export const auth = typeof window === 'undefined' ? getAuth(app) : initializeBrowserAuth();
const dbId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)';
console.log(`[Firebase] Initializing Firestore with DB ID: ${dbId}`);
export const db = getFirestore(app, dbId);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app);

let didConnectFunctionsEmulator = false;

const shouldUseFunctionsEmulator =
  (process.env.NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR ?? '').toLowerCase() === 'true' &&
  typeof window !== 'undefined';

if (shouldUseFunctionsEmulator && !didConnectFunctionsEmulator) {
  const host = process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST || 'localhost';
  const portRaw = process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT || '5001';
  const port = Number(portRaw);

  if (Number.isFinite(port)) {
    connectFunctionsEmulator(functions, host, port);
    didConnectFunctionsEmulator = true;
    console.log(`Connected to Functions Emulator (${host}:${port})`);
  } else {
    console.warn('[Firebase] Invalid NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT. Skipping emulator connection.', { portRaw });
  }
}

export const storage = getStorage(app);

let persistenceBootstrap: Promise<void> | null = null;

export const ensureFirestorePersistence = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (persistenceBootstrap) return persistenceBootstrap;

  persistenceBootstrap = enableMultiTabIndexedDbPersistence(db).catch(() => undefined);

  return persistenceBootstrap;
};

// Analytics (선택사항, 브라우저 환경에서만)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;
