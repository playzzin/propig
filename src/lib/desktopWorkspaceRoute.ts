const desktopPaths = new Set([
  '/habit-tracker/desktop',
  '/propig/desktop',
  '/propig/desktop/memo',
  '/propig/desktop/todo',
]);

export function isDesktopWorkspaceRoute(pathname: string | null) {
  return pathname !== null && desktopPaths.has(pathname.replace(/\/$/, ''));
}

// The native main window starts here and keeps the same document during Next.js navigation.
export const isWindowsDashboard = typeof window !== 'undefined'
  && window.location.pathname.replace(/\/$/, '') === '/propig'
  && new URLSearchParams(window.location.search).get('windows') === 'dashboard'
  && Boolean((window as Window & { chrome?: { webview?: unknown } }).chrome?.webview);
