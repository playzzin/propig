import app from './config';

export const initializeAnalytics = async () => {
  if (
    typeof window === 'undefined' ||
    process.env.NODE_ENV !== 'production' ||
    !process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  ) {
    return null;
  }

  const { getAnalytics, isSupported } = await import('firebase/analytics');
  if (!(await isSupported())) return null;

  return getAnalytics(app);
};
