'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import styled from 'styled-components';
import { isDashboardStyleCorpPath } from '@/constants/dashboardStyleCorpRoutes';

interface CompanyPageShellProps {
  children: ReactNode;
}

export function CompanyPageShell({ children }: CompanyPageShellProps) {
  const pathname = usePathname();

  if (isDashboardStyleCorpPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <Shell>
      <Content>
        <RouteFrame key={pathname} data-company-route-frame>
          {children}
        </RouteFrame>
      </Content>
    </Shell>
  );
}

const Shell = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 0%, rgba(110, 231, 183, 0.12), transparent 28%),
    radial-gradient(circle at 84% 12%, rgba(96, 165, 250, 0.14), transparent 30%),
    #06090f;
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  > main {
    flex: 1;
    min-height: 0;
  }
`;

const RouteFrame = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  > main {
    flex: 1;
    min-height: 0;
  }
`;
