'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const WorkspaceAppLayout = dynamic(
  () => import('@/components/AppLayout').then((module) => module.AppLayout),
);

type RouteAppLayoutProps = {
  children: ReactNode;
};

export function RouteAppLayout({ children }: RouteAppLayoutProps) {
  return <WorkspaceAppLayout>{children}</WorkspaceAppLayout>;
}
