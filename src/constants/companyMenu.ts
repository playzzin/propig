import { CORP_PAGE_DEFINITIONS, type CorpPageDefinition } from '@/constants/corpPages';
import { MENU_PAGE_OPTIONS } from '@/constants/menuPages';

const COMPANY_MENU_ID_BY_PATH = {
  '/corp/company/introduction': 'introduction',
  '/corp/company/ceo-intro': 'ceo',
  '/corp/company/staff-intro': 'staff',
  '/corp/company/product-introduction': 'product',
} as const;

export type CompanyMenuPath = keyof typeof COMPANY_MENU_ID_BY_PATH;
export type CompanyMenuId = (typeof COMPANY_MENU_ID_BY_PATH)[CompanyMenuPath];

export interface CompanyMenuItem {
  id: CompanyMenuId;
  href: CompanyMenuPath;
  path: CompanyMenuPath;
  label: string;
  group: string;
  icon: string;
  keywords: string[];
  eyebrow: string;
  metric: string;
  description: string;
  definition?: CorpPageDefinition;
}

const COMPANY_MENU_EYEBROW_BY_ID: Record<CompanyMenuId, string> = {
  introduction: 'Overview',
  ceo: 'Greeting',
  staff: 'People',
  product: 'Products',
};

const COMPANY_MENU_METRIC_BY_ID: Record<CompanyMenuId, string> = {
  introduction: 'core',
  ceo: 'greeting',
  staff: 'org',
  product: '4 services',
};

const COMPANY_PAGE_DEFINITION_BY_PATH = new Map<string, CorpPageDefinition>(
  CORP_PAGE_DEFINITIONS.map((page) => [page.path, page]),
);

function isCompanyMenuPath(path: string): path is CompanyMenuPath {
  return Object.prototype.hasOwnProperty.call(COMPANY_MENU_ID_BY_PATH, path);
}

export function isCompanyMenuRoute(pathname: string | null | undefined): pathname is CompanyMenuPath {
  if (!pathname) return false;
  const [pathOnly = ''] = pathname.split(/[?#]/);
  const normalizedPath = pathOnly === '/' ? '/' : pathOnly.replace(/\/+$/, '');
  return isCompanyMenuPath(normalizedPath);
}

export const COMPANY_MENU_ITEMS: readonly CompanyMenuItem[] = MENU_PAGE_OPTIONS.filter((page) =>
  isCompanyMenuPath(page.path),
).map((page) => {
  const href = page.path as CompanyMenuPath;
  const id = COMPANY_MENU_ID_BY_PATH[href];
  const definition = COMPANY_PAGE_DEFINITION_BY_PATH.get(href);

  return {
    id,
    href,
    path: href,
    label: page.label,
    group: page.group,
    icon: page.icon ?? 'circle-info',
    keywords: page.keywords ?? [],
    eyebrow: COMPANY_MENU_EYEBROW_BY_ID[id],
    metric: COMPANY_MENU_METRIC_BY_ID[id],
    description: definition?.description ?? page.label,
    definition,
  };
});

export const COMPANY_MENU_PATHS = COMPANY_MENU_ITEMS.map((item) => item.href);

export const COMPANY_MENU_BY_ID = COMPANY_MENU_ITEMS.reduce<Record<CompanyMenuId, CompanyMenuItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<CompanyMenuId, CompanyMenuItem>);

export const COMPANY_MENU_BY_PATH = COMPANY_MENU_ITEMS.reduce<Record<CompanyMenuPath, CompanyMenuItem>>((acc, item) => {
  acc[item.href] = item;
  return acc;
}, {} as Record<CompanyMenuPath, CompanyMenuItem>);
