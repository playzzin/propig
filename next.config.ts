import type { NextConfig } from "next";
import { resolve } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";
const distDir = process.env.NEXT_DIST_DIR;
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const shouldSkipSentry =
  process.env.NODE_ENV === "development" ||
  isStaticExport ||
  process.env.DISABLE_SENTRY === "true" ||
  process.env.NEXT_PUBLIC_DISABLE_SENTRY === "true" ||
  !sentryDsn ||
  /examplePublicKey|example/i.test(sentryDsn);
const disabledSentryModule = './src/lib/sentry-disabled.ts';
const disabledSentryModuleAbsolute = resolve(process.cwd(), disabledSentryModule);

const nextConfig: NextConfig = {
  ...(isStaticExport ? {
    output: "export" as const,
    // Keep old server build route validators out of a client-only export.
    typescript: { tsconfigPath: 'tsconfig.static-export.json' },
  } : {}),
  ...(distDir ? { distDir } : {}),
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    // Static export cannot use the Next image optimizer. Keep optimization
    // enabled for the server runtime and disable it only for hosting export.
    unoptimized: isStaticExport,
  },
  turbopack: shouldSkipSentry
    ? { resolveAlias: { '@sentry/nextjs': disabledSentryModule } }
    : {},
  // PWA 설정
  // PWA 설정 (Firebase Hosting에서 처리)
  // 웹 매니페스트 설정
  webpack(config, { isServer }) {
    if (shouldSkipSentry) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@sentry/nextjs': disabledSentryModuleAbsolute,
      };
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
  /* config options here */
  compiler: {
    styledComponents: true,
  },
  serverExternalPackages: ['ffmpeg-static', 'firebase-admin'],
};

export default shouldSkipSentry ? nextConfig : withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "propig",
  project: "propig-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  webpack: {
    // Automatically annotate React components to show their full name in breadcrumbs and session replays.
    reactComponentAnnotation: {
      enabled: true,
    },
  },
});
