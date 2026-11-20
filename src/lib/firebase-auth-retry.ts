import type { User } from "firebase/auth";

const AUTH_TOKEN_REJECTION_PATTERN =
  /(?:auth(?:entication)?|id)\s+token[^.\n]*(?:invalid|expired|revoked)|(?:invalid|expired|revoked)[^.\n]*(?:auth(?:entication)?|id)\s+token|유효하지 않은 인증 토큰|인증 토큰[^.\n]*(?:만료|무효)/i;

const forcedRefreshes = new WeakMap<User, Promise<string>>();

export function isFirebaseAuthTokenRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return AUTH_TOKEN_REJECTION_PATTERN.test(message);
}

async function getForcedIdToken(user: User): Promise<string> {
  const activeRefresh = forcedRefreshes.get(user);
  if (activeRefresh) return activeRefresh;

  const refresh = user.getIdToken(true);
  forcedRefreshes.set(user, refresh);
  try {
    return await refresh;
  } finally {
    if (forcedRefreshes.get(user) === refresh) {
      forcedRefreshes.delete(user);
    }
  }
}

export async function withFirebaseAuthRetry<T>(
  user: User,
  request: (authToken: string) => Promise<T>,
): Promise<T> {
  try {
    return await request(await user.getIdToken());
  } catch (error) {
    if (!isFirebaseAuthTokenRejected(error)) throw error;

    const freshToken = await getForcedIdToken(user);
    try {
      return await request(freshToken);
    } catch (retryError) {
      if (!isFirebaseAuthTokenRejected(retryError)) throw retryError;
      throw new Error(
        "로그인 세션을 갱신했지만 서버가 인증 토큰을 확인하지 못했습니다. 로그아웃 후 다시 로그인해 주세요.",
      );
    }
  }
}
