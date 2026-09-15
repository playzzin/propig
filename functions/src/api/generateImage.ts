import { HttpsError, onCall } from 'firebase-functions/v2/https';

/**
 * Retired callable surface.
 *
 * Supported clients use /api/generate-image, where permission checks,
 * idempotency, shared rate limits, daily USD reservation, provider timeout,
 * and settlement are enforced together. Keeping the legacy provider
 * implementation here would create a second paid execution boundary.
 */
export const generateImage = onCall({
    timeoutSeconds: 30,
    memory: '256MiB',
    enforceAppCheck: true,
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    throw new HttpsError(
        'failed-precondition',
        '이 이미지 생성 엔드포인트는 종료되었습니다. 최신 Studio API를 사용해 주세요.',
    );
});
