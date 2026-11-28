'use client';

import { useSyncExternalStore } from 'react';
import { DesktopSession } from '@/components/desktop/DesktopSession';
import MarketDashboard from '../../market/MarketDashboard';

const subscribe = () => () => {};
const usesAccount = () => new URLSearchParams(window.location.search).get('account') === '1';

export default function DesktopMarketContent() {
  const signed = useSyncExternalStore<boolean | null>(subscribe, usesAccount, () => null);
  if (signed === null) return null;
  if (signed) return <DesktopSession fullPage>{() => <MarketDashboard compact />}</DesktopSession>;
  return <MarketDashboard compact />;
}
