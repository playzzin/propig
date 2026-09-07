'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/firebase/browserDefaults';
import { AuthProvider } from '@/contexts/AuthContext';
import { SystemProvider } from '@/contexts/SystemContext';
import { MenuProvider } from '@/contexts/MenuContext';

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    const initialize = () => {
      void import('@/firebase/analytics')
        .then(({ initializeAnalytics }) => initializeAnalytics())
        .catch(() => undefined);
    };

    const timeoutId = window.setTimeout(initialize, 5_000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MenuProvider>
          <SystemProvider>{children}</SystemProvider>
        </MenuProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
