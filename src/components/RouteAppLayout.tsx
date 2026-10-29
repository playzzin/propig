'use client';

import type { ReactNode } from 'react';
import { AppLayout } from '@/components/AppLayout';

type RouteAppLayoutProps = {
  children: ReactNode;
};

export function RouteAppLayout({ children }: RouteAppLayoutProps) {
  return <AppLayout>{children}</AppLayout>;
}
