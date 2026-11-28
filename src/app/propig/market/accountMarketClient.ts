import type { Instrument, MarketStock, PriceBar } from './marketData';

type Operation =
  | { op: 'connect'; serviceKey: string; consent: true }
  | { op: 'disconnect' }
  | { op: 'prices'; instrument: Instrument }
  | { op: 'search'; term: string };

// Only the status document is readable by the owner. A client never fetches the shared key.
export function watchAccountMarket(uid: string, onStatus: (connected: boolean) => void, onError: () => void) {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  void Promise.all([import('@/firebase/config'), import('firebase/firestore')]).then(([{ auth, db }, { doc, onSnapshot }]) => {
    if (!active) return;
    if (auth.currentUser?.uid !== uid) { onError(); return; }
    unsubscribe = onSnapshot(doc(db, 'users', uid, 'marketAccount', 'status'), { includeMetadataChanges: true }, snapshot => {
      if (active && !snapshot.metadata.fromCache && auth.currentUser?.uid === uid) onStatus(snapshot.get('connected') === true);
    }, () => { if (active && auth.currentUser?.uid === uid) onError(); });
  }).catch(() => { if (active) onError(); });
  return () => { active = false; unsubscribe?.(); };
}

function accountError(error: unknown, op: Operation['op']) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  switch (code) {
    case 'functions/unauthenticated': return new Error('현재 로그인한 계정을 확인해 주세요.');
    case 'functions/permission-denied': return new Error(op === 'prices' || op === 'search'
      ? '공공데이터포털 인증키와 선택한 시세 서비스의 이용 승인을 확인해 주세요.' : '현재 계정의 시세 연결 권한을 확인해 주세요.');
    case 'functions/failed-precondition': return new Error('계정의 시세 연결 상태가 바뀌었습니다. 현재 계정을 확인해 주세요.');
    case 'functions/resource-exhausted': return new Error('시세 조회 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.');
    case 'functions/invalid-argument': return new Error('공공데이터포털 인증키와 요청 내용을 확인해 주세요.');
    case 'functions/deadline-exceeded': return new Error('계정 시세 요청 시간이 초과되었습니다. 다시 시도해 주세요.');
    default: return new Error('계정 시세 서비스에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
  }
}

async function request<T>(uid: string, operation: Operation, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const [{ auth }, { asiaNortheastFunctions }, { httpsCallable }] = await Promise.all([
    import('@/firebase/config'), import('@/firebase/functions'), import('firebase/functions'),
  ]);
  function checkAccount() {
    signal?.throwIfAborted();
    if (auth.currentUser?.uid !== uid) throw new Error('현재 로그인한 계정이 바뀌었습니다.');
  }
  checkAccount();
  const call = httpsCallable<Operation & { expectedUid: string }, T>(asiaNortheastFunctions, 'accountMarket');
  const result = await call({ ...operation, expectedUid: uid }).catch((error: unknown) => {
    checkAccount();
    throw accountError(error, operation.op);
  });
  checkAccount();
  return result.data;
}

export async function connectAccountMarket(uid: string, serviceKey: string, signal?: AbortSignal) {
  const result = await request<{ connected: boolean }>(uid, { op: 'connect', serviceKey, consent: true }, signal);
  if (result?.connected !== true) throw new Error('계정 시세 연결을 저장하지 못했습니다.');
}

export async function disconnectAccountMarket(uid: string, signal?: AbortSignal) {
  const result = await request<{ connected: boolean }>(uid, { op: 'disconnect' }, signal);
  if (result?.connected !== false) throw new Error('계정 시세 연결을 해제하지 못했습니다.');
}

export async function loadAccountPrices(uid: string, instrument: Instrument, signal: AbortSignal) {
  const result = await request<{ bars: PriceBar[] }>(uid, { op: 'prices', instrument }, signal);
  if (!Array.isArray(result?.bars)) throw new Error('시세 응답을 읽을 수 없습니다.');
  return result.bars;
}

export async function findAccountStocks(uid: string, term: string, signal: AbortSignal) {
  const result = await request<{ matches: MarketStock[] }>(uid, { op: 'search', term }, signal);
  if (!Array.isArray(result?.matches)) throw new Error('종목 검색 응답을 읽을 수 없습니다.');
  return result.matches;
}
