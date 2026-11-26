import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './firestore';

const LOGIN_TIMEOUT_MS = 3 * 60_000;
const ISSUE_WINDOW_MS = 60_000;
const MAX_ISSUES_PER_WINDOW = 6;
const VALUE_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const options = { region: 'asia-northeast3', timeoutSeconds: 20, memory: '256MiB', maxInstances: 5 } as const;

// The existing onboardingInvitations rules exclude all client reads and writes, including for admins.
const loginStorage = db.collection('onboardingInvitations').doc('habitDesktopAuth');
const grants = loginStorage.collection('grants');
const accounts = loginStorage.collection('accounts');

function digest(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
}

function inputValue(value: unknown): value is string {
    return typeof value === 'string' &&
        VALUE_FORMAT.test(value) &&
        Buffer.from(value, 'base64url').toString('base64url') === value;
}

function field(data: unknown, key: string): unknown {
    return data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)[key]
        : undefined;
}

function invalidCode(): HttpsError {
    return new HttpsError('permission-denied', '연결 코드가 유효하지 않습니다. Windows 앱에서 다시 연결해 주세요.');
}

export const createHabitDesktopLogin = onCall<unknown>(options, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ProPig 계정으로 로그인해 주세요.');

    const challenge = field(request.data, 'challenge');
    if (!inputValue(challenge)) throw new HttpsError('invalid-argument', 'Windows 앱에서 다시 연결해 주세요.');

    // The callable runtime checks token validity, while this check also rejects revoked sessions.
    const session = await getAuth().verifyIdToken(request.auth.rawToken, true).catch(() => {
        throw new HttpsError('unauthenticated', '다시 로그인한 뒤 Windows 앱을 연결해 주세요.');
    });
    if (session.uid !== request.auth.uid || !Number.isInteger(session.auth_time)) {
        throw new HttpsError('unauthenticated', '다시 로그인한 뒤 Windows 앱을 연결해 주세요.');
    }

    const code = randomBytes(32).toString('base64url');
    const codeHash = digest(code);
    const accountRef = accounts.doc(digest(session.uid));

    await db.runTransaction(async transaction => {
        const account = await transaction.get(accountRef);
        const now = Date.now();
        const previousWindow = account.get('windowStartedAtMs');
        const withinWindow = typeof previousWindow === 'number' && now - previousWindow < ISSUE_WINDOW_MS;
        const priorCount = account.get('issueCount');
        const issueCount = withinWindow && typeof priorCount === 'number' ? priorCount : 0;
        if (issueCount >= MAX_ISSUES_PER_WINDOW) {
            throw new HttpsError('resource-exhausted', '연결 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.');
        }

        // Issuing a new code replaces the previous grant and retains at most one grant per account.
        const previousCodeHash = account.get('codeHash');
        if (inputValue(previousCodeHash)) transaction.delete(grants.doc(previousCodeHash));

        transaction.create(grants.doc(codeHash), {
            uid: session.uid,
            authTime: session.auth_time,
            challenge,
            expiresAtMs: now + LOGIN_TIMEOUT_MS,
        });
        transaction.set(accountRef, {
            codeHash,
            windowStartedAtMs: withinWindow ? previousWindow : now,
            issueCount: issueCount + 1,
        });
    });

    return { code };
});

export const redeemHabitDesktopLogin = onCall<unknown>({ ...options, cors: false }, async request => {
    const code = field(request.data, 'code');
    const verifier = field(request.data, 'verifier');
    if (!inputValue(code) || !inputValue(verifier)) throw invalidCode();

    const ref = grants.doc(digest(code));
    const expectedChallenge = Buffer.from(digest(verifier), 'base64url');

    // A transactional delete makes concurrent requests with the same code single-use.
    const approval = await db.runTransaction(async transaction => {
        const grant = await transaction.get(ref);
        const uid = grant.get('uid');
        const challenge = grant.get('challenge');
        const expiresAtMs = grant.get('expiresAtMs');
        const authTime = grant.get('authTime');
        if (!grant.exists || typeof uid !== 'string' || !uid ||
            typeof expiresAtMs !== 'number' || expiresAtMs <= Date.now() ||
            typeof authTime !== 'number' || !Number.isInteger(authTime) ||
            !inputValue(challenge) ||
            !timingSafeEqual(expectedChallenge, Buffer.from(challenge, 'base64url'))) {
            throw invalidCode();
        }

        transaction.delete(ref);
        return { uid, authTime };
    });

    const auth = getAuth();
    const account = await auth.getUser(approval.uid).catch((error: unknown) => {
        if (field(error, 'code') === 'auth/user-not-found') throw invalidCode();
        throw error;
    });

    if (account.disabled ||
        (account.tokensValidAfterTime && Date.parse(account.tokensValidAfterTime) > approval.authTime * 1000)) {
        throw invalidCode();
    }
    return { customToken: await auth.createCustomToken(approval.uid) };
});
