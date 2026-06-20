import './globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import ExternalStylesheets from '@/components/ExternalStylesheets';
import StyledComponentsRegistry from '@/lib/registry';

export const metadata: Metadata = {
  title: 'propig',
  description: '자기관리 대시보드와 목표 실행 워크스페이스',
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
      <body>
        <ExternalStylesheets />
        <StyledComponentsRegistry>
          <Providers>
            <AppLayout>{children}</AppLayout>
          </Providers>
        </StyledComponentsRegistry>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
