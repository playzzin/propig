import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { RouteProviders } from './RouteProviders';
import { Toaster } from 'sonner';
import { RouteAppLayout } from '@/components/RouteAppLayout';
import StyledComponentsRegistry from '@/lib/registry';

const developmentCacheResetScript = `
(function () {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && location.hostname !== '::1') return;
  if (sessionStorage.getItem('propig-dev-cache-reset-v2') === 'done') return;
  sessionStorage.setItem('propig-dev-cache-reset-v2', 'done');

  var tasks = [];
  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations()
        .then(function (registrations) {
          return Promise.all(registrations.map(function (registration) {
            return registration.unregister();
          }));
        })
        .then(function (results) {
          return results.some(Boolean);
        })
        .catch(function () { return false; })
    );
  }

  if ('caches' in window) {
    tasks.push(
      caches.keys()
        .then(function (names) {
          return Promise.all(names.map(function (name) {
            return caches.delete(name);
          }));
        })
        .then(function (results) {
          return results.some(Boolean);
        })
        .catch(function () { return false; })
    );
  }

  if (tasks.length > 0) {
    Promise.all(tasks).then(function (didReset) {
      if (didReset.some(Boolean)) location.reload();
    });
  }
})();
`;

export const metadata: Metadata = {
  title: 'propig',
  description: '자기관리 대시보드와 목표 실행 워크스페이스',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {process.env.NODE_ENV === 'development' ? (
          <Script
            id="propig-dev-cache-reset"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: developmentCacheResetScript }}
          />
        ) : null}
        <StyledComponentsRegistry>
          <RouteProviders>
            <RouteAppLayout>{children}</RouteAppLayout>
          </RouteProviders>
        </StyledComponentsRegistry>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
