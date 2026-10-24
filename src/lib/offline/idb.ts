'use client';

/**
 * A tiny IndexedDB wrapper for the field outbox.
 *
 * Why not localStorage: it is capped around 5 MB, stores strings only, and is
 * synchronous — so a handful of site photos would blow the quota, and encoding
 * them as base64 would both inflate them ~33% and jank the main thread. IndexedDB
 * stores Blobs natively, has orders of magnitude more room, and is async.
 *
 * Two stores: `ops` (queue metadata, keyed by op id) and `blobs` (photo Blobs,
 * keyed by attachment id, with the op id indexed so a discarded op takes its
 * photos with it). A localStorage mirror of the op metadata is kept purely so
 * the first paint has something to show before IndexedDB opens.
 */

const DB_NAME = 'vesta-outbox';
const DB_VERSION = 1;
const OPS = 'ops';
const BLOBS = 'blobs';

export type StoredBlob = { id: string; opId: string; name: string; type: string; size: number; blob: Blob };

const databases = new Map<string, Promise<IDBDatabase>>();

export function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function open(owner: string | null): Promise<IDBDatabase> {
  const name = owner === null ? DB_NAME : `${DB_NAME}:${encodeURIComponent(owner)}`;
  const cached = databases.get(name);
  if (cached) return cached;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OPS)) db.createObjectStore(OPS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) {
        const store = db.createObjectStore(BLOBS, { keyPath: 'id' });
        store.createIndex('opId', 'opId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  databases.set(name, promise);
  return promise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, owner: string | null): Promise<T> {
  return open(owner).then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onabort = () => reject(t.error ?? new Error('Device storage transaction was interrupted.'));
    req.onerror = () => reject(req.error);
  }));
}

/* --- ops ------------------------------------------------------------------ */

export async function idbGetOps<T>(owner: string): Promise<T[]> {
  return (await tx<T[]>(OPS, 'readonly', (s) => s.getAll() as IDBRequest<T[]>, owner)) ?? [];
}

/** Replace the whole queue. Small (metadata only), so a full rewrite is simpler
 *  and safer than diffing, and stays atomic inside one transaction. */
export async function idbPutOps<T extends { id: string }>(ops: readonly T[], owner: string): Promise<void> {
  const db = await open(owner);
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(OPS, 'readwrite');
    const store = t.objectStore(OPS);
    store.clear();
    for (const op of ops) store.put(op);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Device storage transaction was interrupted.'));
  });
}

/* --- blobs ---------------------------------------------------------------- */

export async function idbPutBlob(rec: StoredBlob, owner: string): Promise<void> {
  await tx(BLOBS, 'readwrite', (s) => s.put(rec), owner);
}

export async function idbBlobsFor(opId: string, owner: string): Promise<StoredBlob[]> {
  const db = await open(owner);
  return new Promise((resolve, reject) => {
    const t = db.transaction(BLOBS, 'readonly');
    const req = t.objectStore(BLOBS).index('opId').getAll(opId) as IDBRequest<StoredBlob[]>;
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

/** Delete an op's photos — called when it syncs or is discarded, so the device
 *  never accumulates the originals of work that is already safely on the server. */
export async function idbDeleteBlobsFor(opId: string, owner: string): Promise<void> {
  const db = await open(owner);
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(BLOBS, 'readwrite');
    const store = t.objectStore(BLOBS);
    const req = store.index('opId').getAllKeys(opId);
    req.onsuccess = () => { for (const key of req.result) store.delete(key); };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Total bytes of unsent photos — surfaced so "3 photos held" has a real size. */
export async function idbBlobBytes(owner: string): Promise<number> {
  const all = await tx<StoredBlob[]>(BLOBS, 'readonly', (s) => s.getAll() as IDBRequest<StoredBlob[]>, owner);
  return (all ?? []).reduce((n, b) => n + b.size, 0);
}

/** Legacy records have no verified owner. Inspect only to disclose preserved work; never adopt or clear them. */
export async function idbLegacyHasPending(): Promise<boolean> {
  if (!idbAvailable()) return false;
  const old = await tx<{ status?: string }[]>(OPS, 'readonly', (s) => s.getAll(), null);
  return old.some((op) => op.status !== 'synced');
}
