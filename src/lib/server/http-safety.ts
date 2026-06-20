function isPrivateIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::' ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const parts = ipv4.slice(1).map((value) => Number(value));
  if (parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return true;

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;

  return false;
}

export function normalizeExternalHttpUrl(rawUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not allowed.');
  }

  if (isPrivateIpLiteral(parsed.hostname)) {
    throw new Error('Local and private network URLs are not allowed.');
  }

  return parsed.toString();
}

export async function fetchExternalHttpUrl(
  rawUrl: string,
  init: RequestInit = {},
  redirects = 0,
): Promise<Response> {
  const safeUrl = normalizeExternalHttpUrl(rawUrl);
  const response = await fetch(safeUrl, {
    ...init,
    redirect: 'manual',
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3) {
      throw new Error('Too many redirects.');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Redirect response is missing a Location header.');
    }

    const nextUrl = new URL(location, safeUrl).toString();
    return fetchExternalHttpUrl(nextUrl, init, redirects + 1);
  }

  return response;
}
