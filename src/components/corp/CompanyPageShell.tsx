'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';
import { CompanySectionNav } from './CompanySectionNav';

interface CompanyPageShellProps {
  children: ReactNode;
}

export function CompanyPageShell({ children }: CompanyPageShellProps) {
  return (
    <Shell>
      <CompanySectionNav />
      <Content>
        <RouteFrame data-company-route-frame>{children}</RouteFrame>
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
  background: #06110f;
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
