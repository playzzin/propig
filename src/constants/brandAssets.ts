export const DEFAULT_BRAND_NAME = 'ProPig';
export const DEFAULT_BRAND_LOGO = '/propig-favicon.svg';
export const DEFAULT_BRAND_FAVICON = '/propig-favicon.svg';
export const DEFAULT_BRAND_ICO = '/favicon.ico';
export const DEFAULT_BRAND_ICON_192 = '/icons/icon-192.webp';
export const DEFAULT_BRAND_ICON_512 = '/icons/icon-512.webp';
export const BRAND_ASSET_VERSION = 'propig-v3';

const BUILT_IN_BRAND_ASSETS = new Set([
  DEFAULT_BRAND_LOGO,
  DEFAULT_BRAND_FAVICON,
  DEFAULT_BRAND_ICO,
  DEFAULT_BRAND_ICON_192,
  DEFAULT_BRAND_ICON_512,
  '/propig-favicon.svg',
  '/favicon.ico',
]);

const PLACEHOLDER_HOSTS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'placeholder.com',
  'placehold.co',
  'placekitten.com',
  'dummyimage.com',
  'via.placeholder.com',
]);

const PLACEHOLDER_PATH_PATTERN = /(?:placeholder|dummy|sample|temporary|temp-image)/i;

function stripQueryAndHash(src: string): string {
  return src.split(/[?#]/, 1)[0] ?? src;
}

function isBuiltInBrandAsset(src: string): boolean {
  const pathOnly = stripQueryAndHash(src);
  if (BUILT_IN_BRAND_ASSETS.has(pathOnly) || pathOnly.startsWith('/icons/')) return true;

  try {
    const url = new URL(pathOnly);
    return BUILT_IN_BRAND_ASSETS.has(url.pathname) || url.pathname.startsWith('/icons/');
  } catch {
    return false;
  }
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;

  const private172 = host.match(/^172\.(\d+)\./);
  if (!private172) return false;

  const secondOctet = Number(private172[1]);
  return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

export function normalizeBrandAssetUrl(src: string | null | undefined): string {
  const trimmed = src?.trim() ?? '';
  if (!trimmed || isBuiltInBrandAsset(trimmed)) return '';
  return trimmed;
}

export function isPersistableBrandAssetUrl(src: string | null | undefined): boolean {
  const normalized = normalizeBrandAssetUrl(src);
  if (!normalized) return false;
  if (normalized.startsWith('blob:') || normalized.startsWith('data:')) return false;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (isLocalOrPrivateHost(url.hostname)) return false;
    if (PLACEHOLDER_HOSTS.has(url.hostname.toLowerCase())) return false;
    if (PLACEHOLDER_PATH_PATTERN.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizeBrandAssetUrl(src: string | null | undefined): string {
  const normalized = normalizeBrandAssetUrl(src);
  return isPersistableBrandAssetUrl(normalized) ? normalized : '';
}

export function sanitizeBrandAssetMap(
  value: Record<string, string | null | undefined> | null | undefined,
): Record<string, string> {
  if (!value) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([siteId, src]) => [siteId.trim(), sanitizeBrandAssetUrl(src)] as const)
      .filter(([siteId, src]) => siteId.length > 0 && src.length > 0),
  );
}
