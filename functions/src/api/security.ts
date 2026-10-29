import * as admin from 'firebase-admin';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { db } from '../firestore';

if (!admin.apps.length) {
  admin.initializeApp();
}

type HeaderReadableRequest = {
  header(name: string): string | undefined;
};

type ResolvedAddress = {
  address: string;
  family: number;
};

type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type RequestAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401; message: string };

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const EXTERNAL_REQUEST_TIMEOUT_MS = 12_000;
const MAX_EXTERNAL_REDIRECTS = 3;
const SENSITIVE_REDIRECT_HEADERS = ['authorization', 'proxy-authorization', 'cookie'] as const;

export async function requireAuthenticatedUser(req: HeaderReadableRequest): Promise<RequestAuthResult> {
  const authHeader = req.header('authorization') || req.header('Authorization');
  if (!authHeader) {
    return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
  }

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token.trim());
    return { ok: true, uid: decoded.uid };
  } catch {
    return { ok: false, status: 401, message: 'Invalid auth token.' };
  }
}

function isBlockedIpv4Address(address: string): boolean {
  const match = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return true;

  const [a, b, c, d] = match.slice(1).map(Number);
  if ([a, b, c, d].some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function getIpv4FromWords(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function parseIpv6Words(address: string): number[] | null {
  const normalized = address.toLowerCase();
  if (normalized.includes('.')) return null;

  const sections = normalized.split('::');
  if (sections.length > 2) return null;

  const before = sections[0] ? sections[0].split(':') : [];
  const after = sections.length === 2 && sections[1] ? sections[1].split(':') : [];
  const uncompressedLength = before.length + after.length;

  if ((sections.length === 1 && uncompressedLength !== 8) || uncompressedLength > 8) return null;

  const parts = [
    ...before,
    ...Array(Math.max(0, 8 - uncompressedLength)).fill('0'),
    ...after,
  ];

  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  return parts.map((part) => Number.parseInt(part, 16));
}

function isBlockedIpv6Address(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === '::' ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    /^fe[89ab]/.test(host) ||
    host.startsWith('ff') ||
    host.startsWith('2001:db8:')
  ) {
    return true;
  }

  const dottedIpv4Tail = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (dottedIpv4Tail) return isBlockedIpv4Address(dottedIpv4Tail);

  const words = parseIpv6Words(host);
  if (!words) return true;

  const hasIpv4CompatiblePrefix = words.slice(0, 6).every((word) => word === 0);
  const hasIpv4MappedPrefix = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (hasIpv4CompatiblePrefix || hasIpv4MappedPrefix) {
    return isBlockedIpv4Address(getIpv4FromWords(words[6], words[7]));
  }

  if (words[0] === 0x2002) {
    return isBlockedIpv4Address(getIpv4FromWords(words[1], words[2]));
  }

  return false;
}

export function isBlockedRemoteAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '');
  const family = isIP(normalized);
  if (family === 4) return isBlockedIpv4Address(normalized);
  if (family === 6) return isBlockedIpv6Address(normalized);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(host);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (family !== 0 && isBlockedRemoteAddress(host))
  );
}

const resolveHostAddresses: HostResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function resolvePublicHostAddresses(
  hostname: string,
  resolveHost: HostResolver = resolveHostAddresses,
): Promise<ResolvedAddress[]> {
  let addresses: ResolvedAddress[];

  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new Error('The external URL host could not be resolved.');
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedRemoteAddress(address))) {
    throw new Error('Local and private network URLs are not allowed.');
  }

  return addresses;
}

export async function assertHostResolvesToPublicAddresses(
  hostname: string,
  resolveHost: HostResolver = resolveHostAddresses,
): Promise<void> {
  await resolvePublicHostAddresses(hostname, resolveHost);
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

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('Local and private network URLs are not allowed.');
  }

  return parsed.toString();
}

export function normalizeExternalHttpsUrl(rawUrl: string): string {
  const safeUrl = normalizeExternalHttpUrl(rawUrl);
  if (new URL(safeUrl).protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for media assets.');
  }
  return safeUrl;
}

export async function assertExternalHttpsUrl(
  rawUrl: string,
  resolveHost: HostResolver = resolveHostAddresses,
): Promise<string> {
  const safeUrl = normalizeExternalHttpsUrl(rawUrl);
  await resolvePublicHostAddresses(new URL(safeUrl).hostname, resolveHost);
  return safeUrl;
}

function toResponse(response: IncomingMessage): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (typeof value === 'string') {
      headers.set(name, value);
    } else if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    }
  }

  return new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
    status: response.statusCode ?? 502,
    headers,
  });
}

async function requestPinnedExternalUrl(
  parsedUrl: URL,
  address: ResolvedAddress,
  init: RequestInit,
  requestTimeoutMs: number,
): Promise<Response> {
  if (init.body != null) {
    throw new Error('External URL requests with a body are not supported.');
  }
  if (init.signal?.aborted) {
    throw new Error('External URL request was aborted.');
  }

  const headers = new Headers(init.headers);
  headers.set('host', parsedUrl.host);
  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  const request = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const requestHandle = request(
      {
        protocol: parsedUrl.protocol,
        hostname: address.address,
        port: parsedUrl.port || undefined,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: init.method ?? 'GET',
        headers: Object.fromEntries(headers.entries()),
        agent: false,
        ...(parsedUrl.protocol === 'https:' && isIP(hostname) === 0 ? { servername: hostname } : {}),
      },
      (response) => resolve(toResponse(response)),
    );

    const abortRequest = () => requestHandle.destroy(new Error('External URL request was aborted.'));
    requestHandle.setTimeout(
      requestTimeoutMs,
      () => requestHandle.destroy(new Error('External URL request timed out.')),
    );
    const cleanup = () => {
      init.signal?.removeEventListener('abort', abortRequest);
    };

    init.signal?.addEventListener('abort', abortRequest, { once: true });
    requestHandle.on('close', cleanup);
    requestHandle.on('error', (error) => {
      cleanup();
      reject(new Error(error.message === 'External URL request timed out.' ? error.message : 'Failed to fetch external URL.'));
    });
    requestHandle.end();
  });
}

export function stripSensitiveHeadersForCrossOriginRedirect(
  init: RequestInit,
  currentUrl: URL,
  nextUrl: URL,
): RequestInit {
  if (currentUrl.origin === nextUrl.origin) return init;

  const headers = new Headers(init.headers);
  for (const name of SENSITIVE_REDIRECT_HEADERS) headers.delete(name);
  return { ...init, headers };
}

async function fetchExternalUrl(
  rawUrl: string,
  init: RequestInit,
  requireHttps: boolean,
  requestTimeoutMs: number,
  redirects = 0,
): Promise<Response> {
  const safeUrl = requireHttps
    ? normalizeExternalHttpsUrl(rawUrl)
    : normalizeExternalHttpUrl(rawUrl);
  const parsedUrl = new URL(safeUrl);
  const addresses = await resolvePublicHostAddresses(parsedUrl.hostname);
  let response: Response | null = null;
  let lastError: unknown;

  for (const address of addresses) {
    try {
      response = await requestPinnedExternalUrl(parsedUrl, address, init, requestTimeoutMs);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    throw lastError instanceof Error ? lastError : new Error('Failed to fetch external URL.');
  }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= MAX_EXTERNAL_REDIRECTS) {
      throw new Error('Too many redirects.');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Redirect response is missing a Location header.');
    }

    await response.body?.cancel();
    const nextUrl = new URL(location, safeUrl);
    return fetchExternalUrl(
      nextUrl.toString(),
      stripSensitiveHeadersForCrossOriginRedirect(init, parsedUrl, nextUrl),
      requireHttps,
      requestTimeoutMs,
      redirects + 1,
    );
  }

  return response;
}

export async function fetchExternalHttpUrl(
  rawUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetchExternalUrl(rawUrl, init, false, EXTERNAL_REQUEST_TIMEOUT_MS);
}

export async function fetchExternalHttpsUrl(
  rawUrl: string,
  init: RequestInit = {},
  requestTimeoutMs = EXTERNAL_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetchExternalUrl(rawUrl, init, true, requestTimeoutMs);
}

export async function readCappedBinaryResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('A positive response size limit is required.');
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error('External response exceeds the allowed size.');
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error('External response exceeds the allowed size.');
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('External response exceeds the allowed size.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

export async function readCappedTextResponse(response: Response, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('A positive response size limit is required.');
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error('External response exceeds the allowed size.');
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error('External response exceeds the allowed size.');
    }
    return buffer.toString('utf8');
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('External response exceeds the allowed size.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString('utf8');
}

function getTimestampMillis(value: unknown): number | null {
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return null;
  const toMillis = (value as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== 'function') return null;
  const timestamp = toMillis.call(value);
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}

export async function enforceUserRateLimit(input: {
  namespace: string;
  uid: string;
  maxRequests: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const { namespace, uid, maxRequests, windowMs } = input;
  if (!namespace || !uid || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error('Invalid rate limit configuration.');
  }

  const key = Buffer.from(`${namespace}:${uid}`).toString('base64url');
  const reference = db.collection('serverRateLimits').doc(key);
  const now = Date.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data() as { count?: unknown; windowStartedAt?: unknown } | undefined;
    const storedWindowStart = getTimestampMillis(data?.windowStartedAt);
    const windowStartedAt = storedWindowStart !== null && now - storedWindowStart < windowMs ? storedWindowStart : now;
    const storedCount = typeof data?.count === 'number' && Number.isSafeInteger(data.count) && data.count >= 0
      ? data.count
      : 0;
    const nextCount = windowStartedAt === storedWindowStart ? storedCount + 1 : 1;

    if (nextCount > maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1000)),
      };
    }

    transaction.set(
      reference,
      {
        namespace,
        uid,
        count: nextCount,
        windowStartedAt: admin.firestore.Timestamp.fromMillis(windowStartedAt),
        updatedAt: admin.firestore.Timestamp.fromMillis(now),
        expiresAt: admin.firestore.Timestamp.fromMillis(windowStartedAt + windowMs),
      },
      { merge: true },
    );

    return { allowed: true };
  });
}
