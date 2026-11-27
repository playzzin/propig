'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { isDesktopWorkspaceRoute } from '@/lib/desktopWorkspaceRoute';

type RouteAppLayoutProps = {
  children: ReactNode;
};

export function RouteAppLayout({ children }: RouteAppLayoutProps) {
  const pathname = usePathname();
  if (isDesktopWorkspaceRoute(pathname)) return <>{children}</>;
  return <AppLayout>{children}</AppLayout>;
}
