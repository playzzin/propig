import type { MarketQuery } from './marketClient';
import { getPriceHistory, searchStocks } from './marketData';

self.onmessage = ({ data: query }: MessageEvent<MarketQuery>) => {
  // Terminating the worker cancels requests when the view changes or closes.
  const signal = new AbortController().signal;
  const pending = query.kind === 'prices'
    ? getPriceHistory(query.serviceKey, query.instrument, signal)
    : searchStocks(query.serviceKey, query.term, signal);
  void pending.then(
    result => self.postMessage({ result }),
    (error: unknown) => self.postMessage({
      error: error instanceof Error ? error.message : '시세를 불러오지 못했습니다.',
    }),
  );
};
