import { getDownloadURL, ref } from 'firebase/storage';
import { z } from 'zod';
import { storage } from '@/firebase/storage';

export type PhotoImageSource =
  | { kind: 'url'; value: string }
  | { kind: 'storagePath'; value: string };

const STORAGE_PATH_PREFIXES = [
  'images/albums/',
  'ai_generations/',
  'users/',
  'drive/',
  'corp/',
];

const BUILT_IN_ASSET_PATHS = new Set([
  '/favicon.ico',
  '/propig-favicon.svg',
  '/icons/icon-192.webp',
  '/icons/icon-512.webp',
]);

const PLACEHOLDER_HOSTS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'placeholder.com',
  'placehold.co',
  'dummyimage.com',
  'via.placeholder.com',
]);

const PLACEHOLDER_PATH_PATTERN = /(?:placeholder|placehold|dummy|sample|temporary|temp-image|mock-image)/i;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stripQueryAndHash(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? value;
}

function decodeStoragePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
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

function isBuiltInAssetPath(value: string): boolean {
  const pathOnly = stripQueryAndHash(value);
  if (BUILT_IN_ASSET_PATHS.has(pathOnly) || pathOnly.startsWith('/icons/')) return true;

  try {
    const url = new URL(value);
    return BUILT_IN_ASSET_PATHS.has(url.pathname) || url.pathname.startsWith('/icons/');
  } catch {
    return false;
  }
}

function isRejectedUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  if (isLocalOrPrivateHost(url.hostname)) return true;
  if (PLACEHOLDER_HOSTS.has(url.hostname.toLowerCase())) return true;
  if (PLACEHOLDER_PATH_PATTERN.test(url.pathname)) return true;
  return false;
}

export function extractStoragePathFromDownloadUrl(value: unknown): string {
  const src = asTrimmedString(value);
  if (!src) return '';

  try {
    const parsed = new URL(src);
    const marker = '/o/';
    const start = parsed.pathname.indexOf(marker);
    if (start < 0) return '';

    return normalizePhotoStoragePath(parsed.pathname.slice(start + marker.length));
  } catch {
    return '';
  }
}

export function normalizePhotoStoragePath(value: unknown): string {
  const src = asTrimmedString(value);
  if (!src) return '';

  if (src.startsWith('gs://')) {
    const withoutScheme = src.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex < 0) return '';
    return normalizePhotoStoragePath(withoutScheme.slice(slashIndex + 1));
  }

  const cleaned = decodeStoragePath(stripQueryAndHash(src)).replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('://')) return '';

  return STORAGE_PATH_PREFIXES.some((prefix) => cleaned.startsWith(prefix)) ? cleaned : '';
}

export function classifyPhotoImageSource(value: unknown): PhotoImageSource | null {
  const src = asTrimmedString(value);
  if (!src) return null;
  if (src.startsWith('blob:') || src.startsWith('data:')) return null;
  if (isBuiltInAssetPath(src)) return null;

  const storagePath = normalizePhotoStoragePath(src);
  if (storagePath) return { kind: 'storagePath', value: storagePath };

  try {
    const url = new URL(src);
    if (isRejectedUrl(url)) return null;
    return { kind: 'url', value: url.toString() };
  } catch {
    return null;
  }
}

export function isPersistablePhotoImageSource(value: unknown): boolean {
  return classifyPhotoImageSource(value) !== null;
}

export const PhotoImageSourceSchema = z
  .string()
  .trim()
  .refine((value) => isPersistablePhotoImageSource(value), 'Invalid image URL or Storage path.');

export function sanitizePhotoImageUrl(value: unknown): string {
  const source = classifyPhotoImageSource(value);
  return source?.kind === 'url' ? source.value : '';
}

export async function resolvePhotoImageSource(value: unknown): Promise<string> {
  const source = classifyPhotoImageSource(value);
  if (!source) return '';

  if (source.kind === 'url') {
    return source.value;
  }

  return getDownloadURL(ref(storage, source.value));
}

export async function resolveFirstPhotoImageSource(values: unknown[]): Promise<string> {
  for (const value of values) {
    try {
      const resolved = await resolvePhotoImageSource(value);
      if (resolved) return resolved;
    } catch {
      // Keep trying later candidates; callers can surface final load failures.
    }
  }

  return '';
}

export function uniquePhotoImageSources(values: unknown[]): string[] {
  const seen = new Set<string>();
  const sources: string[] = [];

  for (const value of values) {
    const url = sanitizePhotoImageUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push(url);
  }

  return sources;
}

export function getPhotoImagePreviewSources(item: {
  thumbnailUrl?: unknown;
  url?: unknown;
  coverUrl?: unknown;
}): string[] {
  return uniquePhotoImageSources([item.thumbnailUrl, item.url, item.coverUrl]);
}
