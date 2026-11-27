import type { Instrument, MarketStock, PriceBar } from './marketData';

export type MarketQuery =
  | { kind: 'prices'; serviceKey: string; instrument: Instrument }
  | { kind: 'search'; serviceKey: string; term: string };

// Keep key-bearing request URLs out of the page's fetch instrumentation.
function request<T>(query: MarketQuery, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./marketWorker.ts', import.meta.url), { type: 'module' });

    function cleanup() {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    }

    function abort() {
      cleanup();
      reject(signal.reason);
    }

    worker.onmessage = ({ data }: MessageEvent<{ result: T } | { error: string }>) => {
      cleanup();
      if ('result' in data) resolve(data.result);
      else reject(new Error(data.error));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('시세 조회를 시작할 수 없습니다. 화면을 다시 열어 주세요.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.postMessage(query);
  });
}

export function loadPrices(serviceKey: string, instrument: Instrument, signal: AbortSignal) {
  return request<PriceBar[]>({ kind: 'prices', serviceKey, instrument }, signal);
}

export function findStocks(serviceKey: string, term: string, signal: AbortSignal) {
  return request<MarketStock[]>({ kind: 'search', serviceKey, term }, signal);
}
