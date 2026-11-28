'use client';

import { useSyncExternalStore } from 'react';
import { isDesktopWorkspaceRoute } from '@/lib/desktopWorkspaceRoute';
import { getDashboardPlatform } from './mobileDashboardWidget';

export function getDashboardBrand() {
  if (typeof window === 'undefined') return '그뚠웹';
  const platform = getDashboardPlatform();
  const host = window as Window & { chrome?: { webview?: unknown } };
  if (platform === 'windows' || (host.chrome?.webview && isDesktopWorkspaceRoute(window.location.pathname))) return '그뚠뎃';
  if (platform === 'android' || platform === 'ios') return '그뚠앱';

  const device = window.navigator as Navigator & { standalone?: boolean };
  const installed = device.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  const mobile = /Android|iPhone|iPad|iPod/i.test(device.userAgent)
    || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  return installed && mobile ? '그뚠앱' : '그뚠웹';
}

const subscribe = () => () => {};
const serverBrand = () => '그뚠웹' as const;

export function useDashboardBrand() {
  return useSyncExternalStore(subscribe, getDashboardBrand, serverBrand);
}
