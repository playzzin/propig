'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { isHabitDesktopRoute } from '@/lib/habitDesktopRoute';

type RouteAppLayoutProps = {
  children: ReactNode;
};

export function RouteAppLayout({ children }: RouteAppLayoutProps) {
  const pathname = usePathname();
  if (isHabitDesktopRoute(pathname)) return <>{children}</>;
  return <AppLayout>{children}</AppLayout>;
}
