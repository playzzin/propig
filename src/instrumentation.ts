import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const isPlaceholderSentryDsn = (dsn: string | undefined): boolean =>
  !dsn || /examplePublicKey|example/i.test(dsn);
const isSentryEnabled = !isPlaceholderSentryDsn(sentryDsn) && process.env.DISABLE_SENTRY !== "true";

const initSentry = () => {
  Sentry.init({
    dsn: isSentryEnabled ? sentryDsn : undefined,
    enabled: isSentryEnabled,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: false,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  });
};

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initSentry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    initSentry();
  }
}

export const onRequestError = Sentry.captureRequestError;
