import { normalizeServiceKey } from './marketData';

const databaseName = 'geuttun-market';
const storeName = 'connections';
const changeEvent = 'geuttun-market-connection';
const encoder = new TextEncoder();

type SealedKey = { key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
type Entry = { sealed?: SealedKey; pending?: string };

export const marketConnectionScope = (uid: string | null) => uid === null ? 'guest' : 'user:' + uid;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) throw new Error('Secure storage unavailable');
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Secure storage blocked'));
    };
    request.onerror = () => reject(new Error('Secure storage unavailable'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
  });
}

// Run the read and the conditional write in the same IndexedDB transaction.
function withEntry<T>(db: IDBDatabase, scope: string, mode: IDBTransactionMode,
  apply: (entry: Entry | undefined, store: IDBObjectStore) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = store.get(scope);
    let result: T;
    request.onsuccess = () => {
      try { result = apply(request.result, store); }
      catch { transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(new Error('Secure storage transaction failed'));
  });
}

export async function readMarketConnection(scope: string): Promise<string | null> {
  const db = await openDatabase();
  let sealed: SealedKey | undefined;
  try { sealed = await withEntry(db, scope, 'readonly', entry => entry?.sealed); }
  finally { db.close(); }
  if (!sealed) return null;
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.iv, additionalData: encoder.encode(scope) }, sealed.key, sealed.ciphertext,
  );
  const value = normalizeServiceKey(new TextDecoder().decode(plaintext));
  if (!value) throw new Error('Saved connection is invalid');
  return value;
}

export async function saveMarketConnection(scope: string, serviceKey: string): Promise<boolean> {
  const value = normalizeServiceKey(serviceKey);
  if (!value) throw new Error('Invalid service key');
  if (!globalThis.crypto?.subtle) throw new Error('Secure storage unavailable');
  const intent = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const db = await openDatabase();
  try {
    // A delete or replacement that arrives during encryption wins, including across tabs.
    await withEntry(db, scope, 'readwrite', (entry, store) => { store.put({ ...entry, pending: intent }, scope); });
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(scope) }, key, encoder.encode(value),
    );
    const saved = await withEntry(db, scope, 'readwrite', (entry, store) => {
      if (entry?.pending !== intent) return false;
      store.put({ sealed: { key, iv, ciphertext } }, scope);
      return true;
    });
    if (saved) notifyChange(scope);
    return saved;
  } catch (error) {
    // Restore the previous committed key if encryption or structured cloning failed.
    await withEntry(db, scope, 'readwrite', (entry, store) => {
      if (entry?.pending !== intent) return;
      if (entry.sealed) store.put({ sealed: entry.sealed }, scope);
      else store.delete(scope);
    }).catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}

export async function forgetMarketConnection(scope: string): Promise<void> {
  const db = await openDatabase();
  try { await withEntry(db, scope, 'readwrite', (_, store) => { store.delete(scope); }); }
  finally { db.close(); }
  notifyChange(scope);
}

function notifyChange(scope: string) {
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: scope }));
  // Other windows re-read their own scoped record. No credential is sent in events.
  try {
    const channel = new BroadcastChannel(changeEvent);
    channel.postMessage(scope);
    channel.close();
  } catch { /* A returning window also rechecks its local record. */ }
}

export function subscribeMarketConnection(scope: string, onChange: () => void) {
  const local = (event: Event) => { if ((event as CustomEvent).detail === scope) onChange(); };
  const visible = () => { if (document.visibilityState === 'visible') onChange(); };
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(changeEvent);
    channel.onmessage = event => { if (event.data === scope) onChange(); };
  } catch { /* Keep same-window and foreground notifications when channels are unavailable. */ }
  window.addEventListener(changeEvent, local);
  window.addEventListener('pageshow', visible);
  window.addEventListener('focus', visible);
  document.addEventListener('visibilitychange', visible);
  return () => {
    channel?.close();
    window.removeEventListener(changeEvent, local);
    window.removeEventListener('pageshow', visible);
    window.removeEventListener('focus', visible);
    document.removeEventListener('visibilitychange', visible);
  };
}
