'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { isHabitDesktopRoute } from '@/lib/habitDesktopRoute';
import { Providers } from './providers';

type RouteProvidersProps = {
  children: ReactNode;
};

export function RouteProviders({ children }: RouteProvidersProps) {
  const pathname = usePathname();
  if (isHabitDesktopRoute(pathname)) return <AuthProvider>{children}</AuthProvider>;
  return <Providers>{children}</Providers>;
}
