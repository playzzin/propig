'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';

export default function ProductShowcaseWorkspace({ navigation, children }: { navigation: ReactNode; children: ReactNode }) {
  return (
    <Workspace data-product-workspace>
      <Navigation data-product-navigation data-product-interactive>{navigation}</Navigation>
      <Content data-product-content>{children}</Content>
    </Workspace>
  );
}

const Workspace = styled.div`
  display: grid; grid-template-columns: 240px minmax(0, 1fr); min-width: 0; align-items: stretch;
  @container product-showreel (max-width: 960px) { grid-template-columns: 220px minmax(0, 1fr); }
  @container product-showreel (max-width: 760px) { grid-template-columns: minmax(0, 1fr); }
`;
const Navigation = styled.div`
  min-width: 0; padding: 18px 14px; border-right: 1px solid #29405e; background: #08172b;
  @container product-showreel (max-width: 760px) { padding: 10px 12px; border-right: 0; border-bottom: 1px solid #29405e; }
`;
const Content = styled.div`
  display: flex; flex-direction: column; min-width: 0; min-height: 680px; padding: 12px 24px 16px; container-type: inline-size;
  [data-product-canvas] { display: flex; flex-direction: column; flex: 1; min-width: 0; width: 100%; }
  [data-product-story], [data-product-caption] { flex-shrink: 0; }
  [data-product-motion-artwork] { height: 440px; }
  @container product-showreel (max-width: 960px) { min-height: 620px; padding: 12px 20px 14px; [data-product-motion-artwork] { height: 396px; } }
  @container product-showreel (max-width: 760px) { min-height: 0; padding: 12px 12px; [data-product-motion-artwork] { height: 288px; } }
  @container product-showreel (max-width: 420px) { [data-product-motion-artwork='0'] { height: 220px; } }
  @container product-showreel (min-width: 761px) {
    [data-product-motion-artwork] { flex: 1 1 440px; min-height: 440px; }
    [role='tabpanel'] { display: flex; flex-direction: column; flex: 1; }
    [data-content-preview] { flex: 1 1 400px; min-height: 400px; }
  }
`;
