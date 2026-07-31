export const DASHBOARD_STYLE_CORP_PATHS = ['/corp/company/introduction', '/corp/company/ceo-intro'] as const;

export type DashboardStyleCorpPath = (typeof DASHBOARD_STYLE_CORP_PATHS)[number];
export type DashboardStyleCorpVariant = 'introduction' | 'ceo';

const DASHBOARD_STYLE_CORP_VARIANT_BY_PATH: Record<DashboardStyleCorpPath, DashboardStyleCorpVariant> = {
  '/corp/company/introduction': 'introduction',
  '/corp/company/ceo-intro': 'ceo',
};

export function normalizeDashboardStylePath(pathname: string | null | undefined): string {
  if (!pathname) return '';
  const [pathOnly = ''] = pathname.split(/[?#]/);
  if (pathOnly === '/') return '/';
  return pathOnly.replace(/\/+$/, '');
}

export function isDashboardStyleCorpPath(pathname: string | null | undefined): boolean {
  return DASHBOARD_STYLE_CORP_PATHS.includes(
    normalizeDashboardStylePath(pathname) as (typeof DASHBOARD_STYLE_CORP_PATHS)[number],
  );
}

export function getDashboardStyleCorpVariant(pathname: string | null | undefined): DashboardStyleCorpVariant | null {
  const normalizedPath = normalizeDashboardStylePath(pathname) as DashboardStyleCorpPath;
  return DASHBOARD_STYLE_CORP_VARIANT_BY_PATH[normalizedPath] ?? null;
}
