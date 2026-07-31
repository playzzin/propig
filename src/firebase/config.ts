import './browserDefaults';
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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const shouldDebugFirebase =
  (process.env.NEXT_PUBLIC_DEBUG_FIREBASE ?? '').toLowerCase() === 'true';

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
if (shouldDebugFirebase) {
  console.info(`[Firebase] Firestore DB ID: ${dbId}`);
}
export const db = getFirestore(app, dbId);
export const googleProvider = new GoogleAuthProvider();

let persistenceBootstrap: Promise<void> | null = null;

export const ensureFirestorePersistence = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (persistenceBootstrap) return persistenceBootstrap;

  persistenceBootstrap = enableMultiTabIndexedDbPersistence(db).catch(() => undefined);

  return persistenceBootstrap;
};

// Analytics (선택사항, 브라우저 환경에서만)
export default app;
