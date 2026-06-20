'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  User,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  sendPasswordResetEmail,
  UserCredential,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';

type FirebaseEnv = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
};

const getFirebaseEnv = (): FirebaseEnv => {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  };
};

const isFirebaseConfigured = (env: FirebaseEnv): boolean => {
  return Boolean(env.apiKey && env.authDomain && env.projectId && env.apiKey !== 'your-api-key-here');
};

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  loginWithEmail: (email: string, password: string) => Promise<UserCredential>;
  loginWithGoogle: () => Promise<UserCredential>;
  signUpWithEmail: (email: string, password: string) => Promise<UserCredential>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isNativeAuthPlatform = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();
const AUTH_BOOTSTRAP_TIMEOUT_MS = 9000;
const AUTH_PERSISTENCE_TIMEOUT_MS = 2500;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const configureAuthPersistence = async () => {
  if (typeof window === 'undefined') return;

  const persistenceOptions = [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence,
  ];

  let lastError: unknown = null;

  for (const persistence of persistenceOptions) {
    try {
      await setPersistence(auth, persistence);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.warn('[Firebase Auth] Unable to set persistence; continuing without persisted auth state.', lastError);
};

const isMissingNativeAuthPluginError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  return /not implemented|no implementation|not available|plugin .*not/i.test(error.message);
};

const signInWithNativeGoogle = async (): Promise<UserCredential> => {
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken ?? null;
    const accessToken = result.credential?.accessToken ?? null;

    if (!idToken && !accessToken) {
      throw new Error('Google authentication token was not returned by the native app.');
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    return await signInWithCredential(auth, credential);
  } catch (error) {
    if (isMissingNativeAuthPluginError(error)) {
      throw new Error('모바일 앱 로그인 모듈이 아직 반영되지 않았습니다. 새 앱 버전으로 업데이트한 뒤 다시 시도하세요.');
    }
    throw error;
  }
};

const signOutNativeAuth = async () => {
  if (!isNativeAuthPlatform()) return;

  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    await FirebaseAuthentication.signOut();
  } catch (error) {
    console.warn('[Firebase Auth] Native sign out failed.', error);
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const firebaseEnv = useMemo(() => getFirebaseEnv(), []);
  const isConfigured = useMemo(() => isFirebaseConfigured(firebaseEnv), [firebaseEnv]);

  useEffect(() => {
    if (!isConfigured) {
      queueMicrotask(() => {
        setCurrentUser(null);
        setError('Firebase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인하세요.');
        setLoading(false);
      });
      return;
    }

    queueMicrotask(() => {
      setError(null);
    });

    let unsubscribe: (() => void) | null = null;
    let didCancel = false;
    const bootstrapTimeout = window.setTimeout(() => {
      if (didCancel) return;
      setLoading(false);
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    const bootstrap = async () => {
      try {
        await withTimeout(configureAuthPersistence(), AUTH_PERSISTENCE_TIMEOUT_MS);

        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (didCancel) return;
          window.clearTimeout(bootstrapTimeout);
          setCurrentUser(user);
          setError(null);
          setLoading(false);
        });
      } catch {
        if (didCancel) return;
        window.clearTimeout(bootstrapTimeout);
        setError('Firebase 인증 초기화에 실패했습니다.');
        setLoading(false);
      }
    };

    bootstrap();

    return () => {
      didCancel = true;
      window.clearTimeout(bootstrapTimeout);
      unsubscribe?.();
    };
  }, [isConfigured]);

  const assertConfigured = useCallback(() => {
    if (!isConfigured) {
      throw new Error('Firebase가 설정되지 않았습니다. .env.local 파일을 확인하세요.');
    }
  }, [isConfigured]);

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<UserCredential> => {
      assertConfigured();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      setCurrentUser(credential.user);
      setError(null);
      setLoading(false);
      return credential;
    },
    [assertConfigured],
  );

  const loginWithGoogle = useCallback(async (): Promise<UserCredential> => {
    assertConfigured();
    const credential = isNativeAuthPlatform()
      ? await signInWithNativeGoogle()
      : await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    setCurrentUser(credential.user);
    setError(null);
    setLoading(false);
    return credential;
  }, [assertConfigured]);

  const signUpWithEmail = useCallback(
    async (email: string, password: string): Promise<UserCredential> => {
      assertConfigured();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      setCurrentUser(credential.user);
      setError(null);
      setLoading(false);
      return credential;
    },
    [assertConfigured],
  );

  const sendPasswordReset = useCallback(
    async (email: string): Promise<void> => {
      assertConfigured();
      await sendPasswordResetEmail(auth, email);
    },
    [assertConfigured],
  );

  const logout = useCallback(async (): Promise<void> => {
    assertConfigured();
    await signOutNativeAuth();
    await signOut(auth);
    setCurrentUser(null);
    setLoading(false);
  }, [assertConfigured]);

  const value: AuthContextType = {
    currentUser,
    loading,
    error,
    isConfigured,
    loginWithEmail,
    loginWithGoogle,
    signUpWithEmail,
    sendPasswordReset,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
