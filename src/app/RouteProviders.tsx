'use client';

import type { ReactNode } from 'react';
import { Providers } from './providers';

type RouteProvidersProps = {
  children: ReactNode;
};

export function RouteProviders({ children }: RouteProvidersProps) {
  return <Providers>{children}</Providers>;
}
