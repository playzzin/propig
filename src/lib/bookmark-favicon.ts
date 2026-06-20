export const INLINE_BOOKMARK_FAVICON =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2216%22 fill=%22%23111827%22/%3E%3Cpath d=%22M19 18h26a4 4 0 0 1 4 4v28L32 40 15 50V22a4 4 0 0 1 4-4Z%22 fill=%22%2310b981%22/%3E%3Cpath d=%22M23 27h18%22 stroke=%22%23ecfdf5%22 stroke-width=%224%22 stroke-linecap=%22round%22/%3E%3C/svg%3E';

function normalizeUrlInput(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 0 && b === 0)
  );
}

export function isLocalFaviconHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    isPrivateIPv4(normalized)
  );
}

export function buildRootFaviconUrl(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrlInput(url));
    return new URL('/favicon.ico', parsed.origin).toString();
  } catch {
    return null;
  }
}

export function buildGoogleFaviconUrl(url: string, size = 64): string | null {
  try {
    const parsed = new URL(normalizeUrlInput(url));
    const hostname = parsed.hostname;
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
  } catch {
    return null;
  }
}

export function buildFallbackFaviconUrl(url: string, size = 64): string {
  try {
    const parsed = new URL(normalizeUrlInput(url));
    if (isLocalFaviconHost(parsed.hostname)) {
      return buildRootFaviconUrl(parsed.toString()) || INLINE_BOOKMARK_FAVICON;
    }

    return buildGoogleFaviconUrl(parsed.toString(), size) || buildRootFaviconUrl(parsed.toString()) || INLINE_BOOKMARK_FAVICON;
  } catch {
    return INLINE_BOOKMARK_FAVICON;
  }
}
