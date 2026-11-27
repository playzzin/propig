'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { isDesktopWorkspaceRoute } from '@/lib/desktopWorkspaceRoute';
import { Providers } from './providers';

type RouteProvidersProps = {
  children: ReactNode;
};

export function RouteProviders({ children }: RouteProvidersProps) {
  const pathname = usePathname();
  if (isDesktopWorkspaceRoute(pathname)) return <AuthProvider>{children}</AuthProvider>;
  return <Providers>{children}</Providers>;
}
