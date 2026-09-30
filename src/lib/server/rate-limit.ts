import { Timestamp } from 'firebase-admin/firestore';
import { db as adminDb } from '@/lib/firebase-admin';

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function getTimestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return null;

  const toMillis = (value as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== 'function') return null;

  const timestamp = toMillis.call(value);
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Distributed, per-user fixed-window limiter for expensive server routes.
 * The document key is opaque so a custom Auth UID cannot affect its Firestore path.
 */
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
  const reference = adminDb.collection('serverRateLimits').doc(key);
  const now = Date.now();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data() as { count?: unknown; windowStartedAt?: unknown } | undefined;
    const storedWindowStart = getTimestampMillis(data?.windowStartedAt);
    const isCurrentWindow = storedWindowStart !== null && now - storedWindowStart < windowMs;
    const windowStartedAt = isCurrentWindow && storedWindowStart !== null ? storedWindowStart : now;
    const storedCount = typeof data?.count === 'number' && Number.isSafeInteger(data.count) && data.count >= 0
      ? data.count
      : 0;
    const nextCount = isCurrentWindow ? storedCount + 1 : 1;

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
        windowStartedAt: Timestamp.fromMillis(windowStartedAt),
        updatedAt: Timestamp.fromMillis(now),
        expiresAt: Timestamp.fromMillis(windowStartedAt + windowMs),
      },
      { merge: true },
    );

    return { allowed: true };
  });
}
