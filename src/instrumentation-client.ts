import "@/firebase/browserDefaults";

type SentryClient = typeof import("@sentry/nextjs");

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isPlaceholderSentryDsn = (dsn: string | undefined): boolean =>
  !dsn || /examplePublicKey|example/i.test(dsn);
const isSentryEnabled =
  !isPlaceholderSentryDsn(sentryDsn) &&
  process.env.NEXT_PUBLIC_DISABLE_SENTRY !== "true" &&
  process.env.DISABLE_SENTRY !== "true";

let sentryClientPromise: Promise<SentryClient> | null = null;

function loadSentryClient(): Promise<SentryClient> {
  sentryClientPromise ??= import("@sentry/nextjs");
  return sentryClientPromise;
}

if (isSentryEnabled) {
  void loadSentryClient().then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      enabled: true,
      debug: false,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      ],
    });
  });
}

export function onRouterTransitionStart(href: string, navigationType: string): void {
  if (!isSentryEnabled) return;
  void loadSentryClient().then((Sentry) => {
    Sentry.captureRouterTransitionStart(href, navigationType);
  });
}
