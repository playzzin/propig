const desktopPaths = new Set([
  '/habit-tracker/desktop',
  '/propig/desktop',
  '/propig/desktop/memo',
  '/propig/desktop/todo',
]);

export function isDesktopWorkspaceRoute(pathname: string | null) {
  return pathname !== null && desktopPaths.has(pathname.replace(/\/$/, ''));
}
