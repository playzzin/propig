import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { enforceUserRateLimit } from './api/security';
import { db } from './firestore';
import { getPriceHistory, indices, normalizeServiceKey, searchStocks } from './shared/koreanMarket';

const encryptionSecret = defineSecret('MARKET_ACCOUNT_ENCRYPTION_KEY');
const account = z.object({ expectedUid: z.string().min(1).max(128) });
const instrument = z.union([
  z.object({
    kind: z.literal('index'), code: z.enum([indices[0].code, indices[1].code]),
    name: z.string().max(120).optional(),
  }).strict().transform(({ code }) => code === indices[0].code ? indices[0] : indices[1]),
  z.object({
    kind: z.literal('stock'), code: z.string().regex(/^[A-Z0-9]{6}$/),
    name: z.string().trim().min(1).max(120), market: z.enum(['KOSPI', 'KOSDAQ']),
    isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{10}$/).nullable().default(null),
  }).strict(),
]);
const operation = z.discriminatedUnion('op', [
  account.extend({ op: z.literal('status') }).strict(),
  account.extend({ op: z.literal('connect'), consent: z.literal(true), serviceKey: z.string().max(768) }).strict(),
  account.extend({ op: z.literal('disconnect') }).strict(),
  account.extend({ op: z.literal('prices'), instrument }).strict(),
  account.extend({ op: z.literal('search'), term: z.string().trim().min(2).max(32) }).strict(),
]);
type Operation = z.infer<typeof operation>;
type QuoteRequest = Extract<Operation, { op: 'prices' | 'search' }>;

const requestsPerMinute: Record<Operation['op'], number> = {
  status: 60, connect: 6, disconnect: 10, prices: 60, search: 30,
};
const envelope = z.object({
  version: z.literal(1), iv: z.string().length(16), tag: z.string().length(24),
  ciphertext: z.string().min(16).max(344),
}).strict();

function encryptionKey() {
  const secret = encryptionSecret.value();
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32 || key.toString('base64') !== secret) {
    throw new HttpsError('unavailable', '계정 시세 연결을 준비하지 못했습니다.');
  }
  return key;
}

function associatedData(uid: string) {
  return Buffer.from('propig:marketAccount:v1\0' + uid, 'utf8');
}

function encryptKey(uid: string, serviceKey: string): z.infer<typeof envelope> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(associatedData(uid));
  const ciphertext = Buffer.concat([cipher.update(serviceKey, 'utf8'), cipher.final()]);
  return {
    version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptKey(uid: string, data: unknown) {
  const sealed = envelope.parse(data);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(sealed.iv, 'base64'), { authTagLength: 16 });
  decipher.setAAD(associatedData(uid));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

async function queryMarket(serviceKey: string, request: QuoteRequest) {
  const signal = AbortSignal.timeout(24_000);
  try {
    if (request.op === 'prices') return { bars: await getPriceHistory(serviceKey, request.instrument, signal) };
    return { matches: await searchStocks(serviceKey, request.term, signal) };
  } catch (error) {
    if (signal.aborted) throw new HttpsError('deadline-exceeded', '시세 조회 시간이 초과되었습니다. 다시 시도해 주세요.');
    if (error instanceof Error) {
      if (error.message === '인증키와 공공데이터포털의 지수시세·주식시세 이용 승인을 확인해 주세요.') {
        throw new HttpsError('permission-denied', '공공데이터포털 인증키와 선택한 시세 서비스의 이용 승인을 확인해 주세요.');
      }
      if (error.message === '시세 조회 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.') {
        throw new HttpsError('resource-exhausted', '공공데이터포털 시세 조회 한도에 도달했습니다.');
      }
    }
    // Provider and transport errors can contain the request URL (including the service key).
    throw new HttpsError('unavailable', '공공데이터포털 시세를 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
}

export const accountMarket = onCall({
  region: 'asia-northeast3', secrets: [encryptionSecret], timeoutSeconds: 45, memory: '256MiB', maxInstances: 5,
}, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  if (uid.length > 128 || uid.includes('/') || uid === '.' || uid === '..' || /^__.*__$/.test(uid)) {
    throw new HttpsError('permission-denied', '계정 정보를 확인해 주세요.');
  }
  const parsed = operation.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '시세 요청의 입력값을 확인해 주세요.');
  const data = parsed.data;
  if (data.expectedUid !== uid) throw new HttpsError('failed-precondition', '로그인 계정이 변경되었습니다. 다시 시도해 주세요.');

  try {
    const quota = await enforceUserRateLimit({
      uid, namespace: 'account-market-' + data.op, maxRequests: requestsPerMinute[data.op], windowMs: 60_000,
    });
    if (!quota.allowed) throw new HttpsError('resource-exhausted', '시세 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.');

    const status = db.collection('users').doc(uid).collection('marketAccount').doc('status');
    if (data.op === 'status') return { connected: (await status.get()).data()?.connected === true };

    const credential = db.collection('marketAccountCredentials').doc(uid);
    if (data.op === 'connect' || data.op === 'disconnect') {
      const batch = db.batch();
      if (data.op === 'connect') {
        const key = normalizeServiceKey(data.serviceKey);
        if (!key) throw new HttpsError('invalid-argument', '공공데이터포털 인증키 형식을 확인해 주세요.');
        batch.set(credential, encryptKey(uid, key));
        batch.set(status, { connected: true, updatedAt: FieldValue.serverTimestamp() });
      } else {
        batch.delete(credential);
        batch.delete(status);
      }
      await batch.commit();
      return { connected: data.op === 'connect' };
    }

    const snapshot = await credential.get();
    if (!snapshot.exists) throw new HttpsError('failed-precondition', '먼저 이 계정에 시세 인증키를 연결해 주세요.');
    return await queryMarket(decryptKey(uid, snapshot.data()), data);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Firestore, validation and crypto diagnostics stay outside the callable response.
    throw new HttpsError('unavailable', '계정의 시세 연결을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
});
