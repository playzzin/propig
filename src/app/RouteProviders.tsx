'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const WorkspaceProviders = dynamic(
  () => import('./providers').then((module) => module.Providers),
);

type RouteProvidersProps = {
  children: ReactNode;
};

export function RouteProviders({ children }: RouteProvidersProps) {
  return <WorkspaceProviders>{children}</WorkspaceProviders>;
}
