'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/firebase/browserDefaults';
import { AuthProvider } from '@/contexts/AuthContext';
import { SystemProvider } from '@/contexts/SystemContext';
import { MenuProvider } from '@/contexts/MenuContext';
import { DesktopSession } from '@/components/desktop/DesktopSession';
import { DesktopHabitWriteContext } from '@/components/desktop/DesktopHabitWriteContext';
import { isWindowsDashboard } from '@/lib/desktopWorkspaceRoute';

const subscribeToHost = () => () => {};
const hostSnapshot = () => isWindowsDashboard;
const serverSnapshot = () => false;

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const desktop = useSyncExternalStore(subscribeToHost, hostSnapshot, serverSnapshot);
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

  const content = (
    <MenuProvider>
      <SystemProvider>{children}</SystemProvider>
    </MenuProvider>
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {desktop ? (
          <DesktopSession fullPage>
            {({ notifyHabitWrite }) => (
              <DesktopHabitWriteContext.Provider value={notifyHabitWrite}>{content}</DesktopHabitWriteContext.Provider>
            )}
          </DesktopSession>
        ) : content}
      </AuthProvider>
    </QueryClientProvider>
  );
}
