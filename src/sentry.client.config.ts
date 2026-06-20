import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://examplePublicKey@o0.ingest.sentry.io/0",

  // 에러 추적 비율 설정 (운영 환경에서는 적절히 조정)
  tracesSampleRate: 1.0,

  // 세션 리플레이 설정
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Debug 모드 (개발 중에만 유용)
  debug: false,
});
