'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { PROPIG_WIDGET_IDS, type PropigWidgetId } from '@/constants/propigStore';
import { auth, db } from '@/firebase/config';
import type { ChartMode } from '../market/MarketChart';
import { indices, type Instrument } from '../market/marketData';
import { getDashboardPlatform } from './mobileDashboardWidget';

type Layout = { order: PropigWidgetId[]; hidden: PropigWidgetId[] };
type Months = 1 | 3 | 6 | 12;
type MarketView = { instrument: Instrument; months: Months; mode: ChartMode };
type State<T> = { value: T; ready: boolean; error: string | null };
type Change<T> = (current: T) => Partial<T> | null;
type Migration<T> = { value: T; complete: () => void };
type Model<T extends object> = {
  document: string; label: string; localKey: string; fallbackKey?: string;
  initial: State<T>; decode: (data: unknown, previous: T) => T;
  migrate?: (uid: string) => Promise<Migration<T> | null>;
};

const layoutKey = 'propig:widget-layout:v1';
const defaultLayout: Layout = { order: PROPIG_WIDGET_IDS, hidden: [] };
const defaultMarket: MarketView = { instrument: indices[0], months: 3, mode: 'line' };
const localEvent = 'propig-dashboard-preference-change';
const sessionValues = new Map<string, object>(); // Storage-limited guest windows.

function fields(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isWidget(value: unknown): value is PropigWidgetId {
  return PROPIG_WIDGET_IDS.some(id => id === value);
}

function widgetList(value: unknown): PropigWidgetId[] {
  return Array.isArray(value) ? [...new Set(value.filter(isWidget))] : [];
}

function decodeLayout(data: unknown): Layout {
  const raw = fields(data), order = widgetList(raw.order);
  return { order: [...order, ...PROPIG_WIDGET_IDS.filter(id => !order.includes(id))], hidden: widgetList(raw.hidden) };
}

function isMonths(value: unknown): value is Months {
  return value === 1 || value === 3 || value === 6 || value === 12;
}

function instrumentFrom(value: unknown, previous: Instrument): Instrument | null {
  const raw = fields(value);
  if (raw.kind === 'index') return indices.find(index => index.code === raw.code) ?? null;
  if (raw.kind !== 'stock' || typeof raw.code !== 'string' || !/^[A-Z0-9]{6}$/.test(raw.code)
      || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 120
      || (raw.market !== 'KOSPI' && raw.market !== 'KOSDAQ')) return null;
  const name = raw.name.trim();
  const isin = typeof raw.isin === 'string' && /^[A-Z]{2}[A-Z0-9]{10}$/.test(raw.isin) ? raw.isin : null;
  // A period or chart-style update must not restart the price request for this stock.
  if (previous.kind === 'stock' && previous.code === raw.code && previous.name === name
      && previous.market === raw.market && previous.isin === isin) return previous;
  return { kind: 'stock', code: raw.code, name, market: raw.market, isin };
}

function decodeMarket(data: unknown, previous: MarketView): MarketView {
  const raw = fields(data);
  return { instrument: instrumentFrom(raw.instrument, previous.instrument) ?? indices[0],
    months: isMonths(raw.months) ? raw.months : defaultMarket.months, mode: raw.mode === 'candle' ? 'candle' : 'line' };
}

function platformKey(base: string) {
  const platform = getDashboardPlatform();
  return platform === 'web' ? base : `${base}:${platform}`;
}

function localRecord(key: string, fallback?: string): { key: string; value: unknown } | null {
  try {
    for (const source of new Set([key, ...(fallback ? [fallback] : [])])) {
      const temporary = sessionValues.get(source);
      if (temporary) return { key: source, value: temporary };
      const raw = window.localStorage.getItem(source);
      if (raw !== null) return { key: source, value: JSON.parse(raw) };
    }
  } catch { /* The browser may disable storage or contain an obsolete value. */ }
  return null;
}

// Older browsers without Web Locks can still atomically assign an owner across tabs.
async function claimWithIndexedDb(key: string, uid: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const open = window.indexedDB.open('propig-dashboard-migrations', 1);
    let blocked = false;
    open.onupgradeneeded = () => open.result.createObjectStore('owners');
    open.onerror = () => reject(open.error);
    open.onblocked = () => { blocked = true; resolve(false); };
    open.onsuccess = () => {
      const database = open.result;
      if (blocked) { database.close(); return; }
      const tx = database.transaction('owners', 'readwrite');
      const store = tx.objectStore('owners'), get = store.get(key);
      let claimed = false;
      get.onsuccess = () => {
        claimed = get.result === undefined || get.result === uid;
        if (get.result === undefined) store.add(uid, key);
      };
      tx.oncomplete = () => { database.close(); resolve(claimed); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    };
  });
}

async function legacyLayout(uid: string): Promise<Migration<Layout> | null> {
  const record = localRecord(platformKey(layoutKey), layoutKey);
  if (!record || sessionValues.has(record.key)) return null;
  const value = decodeLayout(record.value);
  if (!value.hidden.length && value.order.every((id, index) => id === PROPIG_WIDGET_IDS[index])) return null;
  const ownerKey = `${record.key}:migration-owner`, doneKey = `${record.key}:migrated`;
  try {
    const storage = window.localStorage;
    if (storage.getItem(doneKey)) return null;
    const reserve = async () => {
      const owner = storage.getItem(ownerKey);
      if (owner !== null) return owner === uid;
      if (!window.navigator.locks && !await claimWithIndexedDb(ownerKey, uid)) return false;
      storage.setItem(ownerKey, uid);
      return true;
    };
    const mine = window.navigator.locks ? await window.navigator.locks.request(ownerKey, reserve) : await reserve();
    if (!mine) return null;
    let completed = false;
    return { value, complete: () => {
      if (completed) return;
      try { storage.setItem(doneKey, '1'); completed = true; } catch { /* The server transaction also checks for an existing document. */ }
    } };
  } catch { return null; }
}

const layoutModel: Model<Layout> = { document: 'dashboardLayout', label: '위젯 배치', localKey: layoutKey, fallbackKey: layoutKey,
  initial: { value: defaultLayout, ready: false, error: null }, decode: decodeLayout, migrate: legacyLayout };
const marketModel: Model<MarketView> = { document: 'marketView', label: '차트 설정', localKey: 'propig:market-view:v1',
  initial: { value: defaultMarket, ready: false, error: null }, decode: decodeMarket };

function createPreferences<T extends object>(uid: string | null, model: Model<T>) {
  let state = model.initial, confirmed = state.value;
  let generation = 0, cancel = () => {};
  let writing = false, writeFailed = false;
  const changes: Change<T>[] = [];
  const listeners = new Set<() => void>();
  const saveError = `${model.label} 정보를 저장하지 못했습니다. 다시 시도해 주세요.`;

  function show(value: T, ready: boolean, error: string | null = null) {
    state = { value, ready, error };
    for (const notify of listeners) notify();
  }

  function start() {
    const attempt = ++generation;
    cancel();
    const current = () => generation === attempt && listeners.size > 0;
    const failed = () => {
      if (!current()) return;
      generation++;
      show(confirmed, false, `${model.label} 정보를 불러오지 못했습니다. 다시 시도해 주세요.`);
    };
    const synchronized = (value: T) => {
      confirmed = value;
      show(value, true, writeFailed ? saveError : null);
      flush();
    };
    if (!uid) {
      const key = platformKey(model.localKey);
      const read = () => {
        const value = model.decode(localRecord(key, model.fallbackKey)?.value, state.value);
        const error = sessionValues.has(key) ? `${model.label} 정보를 기기에 저장할 수 없어 이 창에서만 적용했습니다.` : null;
        show(value, true, error);
      };
      const storageChanged = (event: StorageEvent) => {
        if (event.key === null || event.key === key || event.key === model.fallbackKey) {
          sessionValues.delete(key); read();
        }
      };
      const localChanged = (event: Event) => { if ((event as CustomEvent<string>).detail === key) read(); };
      window.addEventListener(localEvent, localChanged);
      window.addEventListener('storage', storageChanged);
      cancel = () => { window.removeEventListener(localEvent, localChanged); window.removeEventListener('storage', storageChanged); };
      read();
      return;
    }

    try {
      cancel = listenToAccount(uid);
    } catch { failed(); }

    function listenToAccount(account: string) {
      const ref = doc(db, 'users', account, 'propigStore', model.document);
      const migration = model.migrate?.(account);
      let firstServer = true, serverVersion = 0;
      show(confirmed, false);
      return onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
        if (!current() || snapshot.metadata.hasPendingWrites) return;
        const value = model.decode(snapshot.data(), state.value);
        if (snapshot.metadata.fromCache) {
          if (firstServer && snapshot.exists()) {
            confirmed = value;
            show(value, false);
          }
          return;
        }
        const version = ++serverVersion;
        const checkImport = firstServer && migration && !snapshot.exists();
        firstServer = false;
        if (!checkImport) {
          synchronized(value);
          if (snapshot.exists()) void migration?.then(candidate => candidate?.complete());
          return;
        }
        void (async () => {
          const candidate = await migration;
          if (!current() || version !== serverVersion) return;
          let loaded = value;
          if (candidate) {
            loaded = await runTransaction(db, async tx => {
              const latest = await tx.get(ref);
              if (!current()) throw new Error('Preference session ended');
              if (latest.exists()) return model.decode(latest.data(), state.value);
              tx.set(ref, { ...candidate.value });
              return candidate.value;
            });
            candidate.complete();
          }
          if (current() && version === serverVersion) synchronized(loaded);
        })().catch(() => { if (version === serverVersion) failed(); });
      }, failed);
    }
  }

  function edit(change: Change<T>) {
    if (!listeners.size) return;
    if (uid) {
      // Only gestures enter this queue. Wait for an authoritative snapshot before applying them.
      changes.push(change);
      flush();
      return;
    }
    const key = platformKey(model.localKey), value = model.decode(localRecord(key, model.fallbackKey)?.value, state.value);
    const patch = change(value);
    if (!patch) return;
    const next = { ...value, ...patch };
    try { window.localStorage.setItem(key, JSON.stringify(next)); sessionValues.delete(key); }
    catch { sessionValues.set(key, next); }
    window.dispatchEvent(new CustomEvent(localEvent, { detail: key }));
  }

  function flush() {
    if (!uid || !listeners.size || !changes.length || !state.ready || writing || writeFailed) return;
    const attempt = generation;
    // A submitted selection survives navigation within this account, even after its view unmounts.
    const ownsChanges = () => auth.currentUser?.uid === uid;
    writing = true;
    // Retry the failed gesture before later gestures, using the latest data for each transaction.
    void (async () => {
      const ref = doc(db, 'users', uid, 'propigStore', model.document);
      while (changes.length && ownsChanges()) {
        const change = changes[0];
        await runTransaction(db, async tx => {
          const latest = await tx.get(ref);
          if (!ownsChanges()) throw new Error('Preference account changed');
          const patch = change(model.decode(latest.data(), state.value));
          if (patch) tx.set(ref, { ...patch }, { mergeFields: Object.keys(patch) });
        });
        changes.shift();
      }
    })().catch(() => {
      if (generation === attempt && listeners.size && ownsChanges()) { writeFailed = true; show(confirmed, state.ready, saveError); }
    }).finally(() => {
      writing = false;
      if (generation !== attempt) flush();
    });
  }

  return {
    subscribe(notify: () => void) {
      listeners.add(notify);
      if (listeners.size === 1) start();
      return () => { listeners.delete(notify); if (!listeners.size) { generation++; cancel(); } };
    },
    read: () => state, server: () => model.initial, edit,
    retry() {
      if (!listeners.size) return;
      if (!uid) {
        const temporary = sessionValues.get(platformKey(model.localKey));
        if (temporary) edit(() => model.decode(temporary, state.value));
        return;
      }
      writeFailed = false;
      if (!state.ready) start();
      else { show(state.value, true); flush(); }
    },
  };
}

function usePreferences<T extends object>(uid: string | null, model: Model<T>) {
  const store = useMemo(() => createPreferences(uid, model), [uid, model]);
  const state = useSyncExternalStore(store.subscribe, store.read, store.server);
  return { ...state, edit: store.edit, retry: store.retry };
}

export function useDashboardLayout(uid: string | null) {
  const { value, ready, error, edit, retry } = usePreferences(uid, layoutModel);
  return { ...value, ready, error, retry,
    move(activeId: PropigWidgetId, overId: PropigWidgetId) {
      if (!isWidget(activeId) || !isWidget(overId) || activeId === overId) return;
      edit(current => {
        const order = [...current.order], target = order.indexOf(overId);
        order.splice(order.indexOf(activeId), 1); order.splice(target, 0, activeId);
        return { order };
      });
    },
    setHidden(id: PropigWidgetId, hidden: boolean) {
      if (!isWidget(id)) return;
      edit(current => current.hidden.includes(id) === hidden ? null :
        { hidden: hidden ? [...current.hidden, id] : current.hidden.filter(item => item !== id) });
    },
    reset() { edit(() => defaultLayout); },
  };
}

export function useMarketView(uid: string | null) {
  const { value, ready, error, edit, retry } = usePreferences(uid, marketModel);
  return { ...value, ready, error, retry,
    selectInstrument(selection: Instrument) {
      const instrument = instrumentFrom(selection, value.instrument);
      if (instrument) edit(() => ({ instrument }));
    },
    setMonths(months: number) { if (isMonths(months)) edit(() => ({ months })); },
    setMode(mode: ChartMode) { if (mode === 'candle' || mode === 'line') edit(() => ({ mode })); },
  };
}
