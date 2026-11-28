export const marketSources = {
  index: 'https://www.data.go.kr/data/15094807/openapi.do',
  stock: 'https://www.data.go.kr/data/15094808/openapi.do',
};

const api = {
  index: 'https://apis.data.go.kr/1160100/GetMarketIndexInfoService_V2/getStockMarketIndex_V2',
  stock: 'https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2',
};

export const indices = [
  { kind: 'index', code: 'KOSPI', name: '코스피' },
  { kind: 'index', code: 'KOSDAQ', name: '코스닥' },
] as const;

export type MarketIndex = typeof indices[number];
export type MarketStock = {
  kind: 'stock';
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  isin: string | null;
};
export type Instrument = MarketIndex | MarketStock;

export type PriceBar = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  change: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function dateString(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null;
  const iso = value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6);
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function marketDate(daysAgo: number) {
  return new Date(Date.now() + (9 * 60 * 60 * 1000) - (daysAgo * 86400000))
    .toISOString().slice(0, 10).replace(/-/g, '');
}

export function normalizeServiceKey(value: string) {
  const input = value.trim();
  let decoded = input;
  try { decoded = decodeURIComponent(input); } catch { return null; }
  return /^[a-zA-Z0-9+/_=.-]{12,256}$/.test(decoded) ? decoded : null;
}

function accessError() {
  return new Error('인증키와 공공데이터포털의 지수시세·주식시세 이용 승인을 확인해 주세요.');
}

async function requestPage(
  endpoint: keyof typeof api,
  key: string,
  params: Record<string, string>,
  page: number,
  limit: number,
  signal: AbortSignal,
) {
  const url = new URL(api[endpoint]);
  url.search = new URLSearchParams({
    ...params, serviceKey: key, resultType: 'json', pageNo: String(page), numOfRows: String(limit),
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('시세 제공 서비스에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  if (response.status === 401 || response.status === 403) throw accessError();
  if (response.status === 429) throw new Error('시세 조회 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.');
  if (!response.ok) throw new Error('시세 제공 서비스에서 응답을 받지 못했습니다.');

  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('시세 제공 서비스의 응답 형식이 올바르지 않습니다.'); }

  const envelope = record(record(payload)?.response);
  const code = String(record(envelope?.header)?.resultCode ?? '');
  if (['20', '30', '31', '32'].includes(code)) throw accessError();
  if (['22', '23'].includes(code)) throw new Error('시세 조회 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.');
  if (!['0', '00', '0000'].includes(code)) throw new Error('시세 제공 서비스에서 조회를 완료하지 못했습니다.');
  const body = record(envelope?.body);
  if (!body) throw new Error('시세 제공 서비스의 응답 형식이 올바르지 않습니다.');
  const items = record(body.items)?.item;
  const raw = Array.isArray(items) ? items : items ? [items] : [];
  if (raw.length === 0 && (number(body.totalCount) ?? 0) > 0) {
    throw new Error('시세 제공 서비스의 응답 형식이 올바르지 않습니다.');
  }
  const rows = raw.map(record).filter(row => row !== null);
  return { rows, total: number(body.totalCount), pageSize: positive(body.numOfRows) ?? limit };
}

function stockFrom(row: Record<string, unknown>): MarketStock | null {
  const rawCode = typeof row.srtnCd === 'string' ? row.srtnCd.trim().toUpperCase() : '';
  const code = /^A[A-Z0-9]{6}$/.test(rawCode) ? rawCode.slice(1) : rawCode;
  const name = typeof row.itmsNm === 'string' ? row.itmsNm.trim() : '';
  const market = row.mrktCtg ?? row.mrktCls;
  if (!/^[A-Z0-9]{6}$/.test(code) || !name || (market !== 'KOSPI' && market !== 'KOSDAQ')) return null;
  const isin = typeof row.isinCd === 'string' && /^[A-Z]{2}[A-Z0-9]{10}$/.test(row.isinCd) ? row.isinCd : null;
  return { kind: 'stock', code, name, market, isin };
}

export async function searchStocks(key: string, term: string, signal: AbortSignal) {
  const query = term.trim();
  if (query.length < 2 || query.length > 32) return [];
  const isCode = /^[A-Z0-9]{2,6}$/i.test(query) && /\d/.test(query);
  const filter: Record<string, string> = isCode ? { likeSrtnCd: query.toUpperCase() } : { likeItmsNm: query };
  const { rows } = await requestPage('stock', key, { ...filter, beginBasDt: marketDate(15) }, 1, 100, signal);
  const byCode = new Map<string, MarketStock>();
  for (const row of [...rows].sort((a, b) => String(b.basDt ?? '').localeCompare(String(a.basDt ?? '')))) {
    const stock = stockFrom(row);
    if (stock && !byCode.has(stock.code)) byCode.set(stock.code, stock);
  }
  return [...byCode.values()].sort((a, b) => {
    const rank = (stock: MarketStock) => stock.code === query.toUpperCase() || stock.name === query ? 0
      : stock.name.startsWith(query) ? 1 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko');
  }).slice(0, 20);
}

export async function getPriceHistory(key: string, instrument: Instrument, signal: AbortSignal) {
  const begin = marketDate(390);
  const filter: Record<string, string> = { beginBasDt: begin };
  if (instrument.kind === 'index') filter.idxNm = instrument.name;
  else if (instrument.isin) filter.isinCd = instrument.isin;
  else filter.likeSrtnCd = instrument.code;

  const bars = new Map<string, PriceBar>();
  for (let page = 1; page <= 8; page += 1) {
    const batch = await requestPage(instrument.kind, key, filter, page, 400, signal);
    for (const row of batch.rows) {
      if (instrument.kind === 'index' && row.idxNm !== instrument.name) continue;
      if (instrument.kind === 'stock' && stockFrom(row)?.code !== instrument.code) continue;
      const date = dateString(row.basDt);
      const close = positive(row.clpr);
      if (!date || close === null || date.replace(/-/g, '') < begin) continue;
      const open = positive(row.mkp);
      const high = positive(row.hipr);
      const low = positive(row.lopr);
      const hasOhlc = open !== null && high !== null && low !== null &&
        high >= Math.max(open, close) && low <= Math.min(open, close);
      bars.set(date, {
        date, close, open: hasOhlc ? open : null, high: hasOhlc ? high : null, low: hasOhlc ? low : null,
        change: number(row.fltRt),
      });
    }
    const hasNext = batch.total === null ? batch.rows.length === batch.pageSize : page * batch.pageSize < batch.total;
    if (!hasNext || batch.rows.length === 0) break;
    if (page === 8) throw new Error('시세 조회 범위를 처리할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  return [...bars.values()].sort((a, b) => a.date.localeCompare(b.date));
}
