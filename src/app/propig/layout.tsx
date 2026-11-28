import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '그뚠웹 | 나에게 맞는 대시보드',
  description: '메모와 할 일, 습관, 날씨, PC 상태와 국내 증시를 내 대시보드에 모아 보세요.',
  applicationName: '그뚠웹',
  manifest: '/propig/dashboard.webmanifest',
  appleWebApp: { capable: true, title: '그뚠웹' },
  icons: { apple: '/icons/justpig-favicon-144.png' },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
