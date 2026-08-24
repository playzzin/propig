const CORP_ROOT = '/corp';
const CORP_PROJECT_ROOT = '/corp/project';

function isPathAtOrBelow(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isCorpWorkspacePath(pathname: string | null): boolean {
  return Boolean(pathname && isPathAtOrBelow(pathname, CORP_PROJECT_ROOT));
}

export function isPublicCorpPath(pathname: string | null): boolean {
  if (!pathname || !isPathAtOrBelow(pathname, CORP_ROOT)) return false;
  return !isCorpWorkspacePath(pathname);
}

export function needsWorkspaceShell(_pathname: string | null): boolean {
  return true;
}
