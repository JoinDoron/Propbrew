'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { applyOutcome, dueOps, enqueue, prunable, type OutboxOp, type OpKind, type SyncOutcome } from '@/domain/sync';
import { syncOperation, abandonOperation } from '@/server/actions/sync';
import { idbAvailable, idbGetOps, idbPutOps, idbPutBlob, idbDeleteBlobsFor, idbBlobsFor, idbLegacyHasPending } from './idb';

const LEGACY_KEY = 'vesta.outbox.v1';
const key = (owner: string) => `propbrew.outbox.v2:${encodeURIComponent(owner)}`;
const EMPTY: OutboxOp[] = [];
const stores = new Map<string, { cache: OutboxOp[] | null; hydrated: boolean; listeners: Set<() => void> }>();
function store(owner: string) {
  let current = stores.get(owner);
  if (!current) { current = { cache: null, hydrated: false, listeners: new Set() }; stores.set(owner, current); }
  return current;
}
function read(owner: string): OutboxOp[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(key(owner));
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((op): op is OutboxOp => !!op && typeof op === 'object' && typeof op.id === 'string' && typeof op.kind === 'string' && typeof op.capturedISO === 'string' && !!op.payload && Number.isInteger(op.attachments) && op.attachments >= 0).map((op) => op.status === 'sending' ? { ...op, status: 'queued' } : op) : [];
  } catch { return EMPTY; }
}
function snapshot(owner?: string): OutboxOp[] {
  if (!owner) return EMPTY;
  const current = store(owner);
  if (current.cache === null) current.cache = read(owner);
  return current.cache;
}
function commit(owner: string, next: OutboxOp[]): void {
  const current = store(owner);
  // Never acknowledge a capture if neither persistence path can keep it.
  window.localStorage.setItem(key(owner), JSON.stringify(next));
  current.cache = next;
  if (idbAvailable()) void idbPutOps(next, owner).catch(() => { /* synchronous mirror remains intact */ });
  current.listeners.forEach((l) => l());
}
export async function hydrateFromIdb(owner?: string): Promise<void> {
  if (!owner || store(owner).hydrated || !idbAvailable()) return;
  store(owner).hydrated = true;
  try {
    const stored = await idbGetOps<OutboxOp>(owner);
    const merged = new Map(snapshot(owner).map((o) => [o.id, o]));
    // Interrupted sends are safe to retry, using the same owner/content receipt.
    for (const op of stored) if (!merged.has(op.id)) merged.set(op.id, op.status === 'sending' ? { ...op, status: 'queued' } : op);
    if (merged.size) commit(owner, [...merged.values()]);
  } catch { /* keep the existing account's mirror */ }
}
function subscribe(owner: string | undefined, listener: () => void): () => void {
  if (!owner) return () => {};
  store(owner).listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === key(owner)) { store(owner).cache = read(owner); listener(); } };
  window.addEventListener('storage', onStorage);
  return () => { store(owner).listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

/** Old queues are retained untouched because there is no evidence of who captured them. */
export function useLegacyOutboxNotice(): boolean {
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    let active = true;
    let local = false;
    try { const value = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? '[]'); local = Array.isArray(value) && value.some((op) => op.status !== 'synced'); } catch { local = true; }
    void idbLegacyHasPending().then((pending) => { if (active) setLegacy(local || pending); }).catch(() => { if (active && local) setLegacy(true); });
    return () => { active = false; };
  }, []);
  return legacy;
}

const FORCE_KEY = 'vesta.outbox.forceOffline';
export function isForcedOffline(): boolean { try { return window.localStorage.getItem(FORCE_KEY) === '1'; } catch { return false; } }
export function setForcedOffline(on: boolean): void {
  try { if (on) window.localStorage.setItem(FORCE_KEY, '1'); else window.localStorage.removeItem(FORCE_KEY); } catch { /* device setting only */ }
  window.dispatchEvent(new Event(on ? 'offline' : 'online'));
}
function onlineSubscribe(l: () => void) { window.addEventListener('online', l); window.addEventListener('offline', l); return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); }; }
function onlineSnapshot() { return typeof navigator === 'undefined' ? true : navigator.onLine && !isForcedOffline(); }
export function useOnline() { return useSyncExternalStore(onlineSubscribe, onlineSnapshot, () => true); }
export function useOutbox(owner?: string): OutboxOp[] {
  return useSyncExternalStore(useCallback((l) => subscribe(owner, l), [owner]), useCallback(() => snapshot(owner), [owner]), () => EMPTY);
}

/** Capture acknowledges only after metadata AND every supplied file are durable. */
export async function capture(owner: string | undefined, kind: OpKind, label: string, payload: Record<string, unknown>, attachments: readonly File[] = []): Promise<OutboxOp> {
  if (!owner) throw new Error('Sign in to a tenant workspace before capturing work.');
  if (attachments.length && !idbAvailable()) throw new Error('This device cannot store photos offline. Keep the form open and retry when storage is available.');
  const op: OutboxOp = { id: crypto.randomUUID(), kind, label, payload, capturedISO: new Date().toISOString(), attachments: attachments.length, status: 'queued', attempts: 0 };
  // Do not publish a drainable record until all file transactions have completed.
  for (const [i, file] of attachments.entries()) await idbPutBlob({ id: `${op.id}-${i}`, opId: op.id, name: file.name, type: file.type, size: file.size, blob: file }, owner);
  commit(owner, enqueue(snapshot(owner), op));
  return op;
}
export async function attachmentsFor(owner: string, opId: string) { return idbAvailable() ? idbBlobsFor(opId, owner) : []; }
export function removeOp(owner: string | undefined, id: string): void {
  if (!owner) return;
  commit(owner, snapshot(owner).filter((op) => op.id !== id));
  if (idbAvailable()) void idbDeleteBlobsFor(id, owner).catch(() => {});
}
export function clearSynced(owner?: string): void { if (owner) commit(owner, snapshot(owner).filter((op) => op.status !== 'synced')); }
export async function abandon(owner: string | undefined, id: string): Promise<void> {
  if (!owner) throw new Error('Sign in before discarding captured work.');
  const op = snapshot(owner).find((o) => o.id === id);
  if (!op) throw new Error('The local record was not found.');
  const outcome = await abandonOperation({ owner, id, kind: op.kind, capturedISO: op.capturedISO, payload: op.payload });
  if (!outcome.ok) throw new Error(outcome.error);
  removeOp(owner, id);
}
export function requeue(owner: string | undefined, id: string): void { if (owner) commit(owner, snapshot(owner).map((op) => op.id === id ? { ...op, status: 'queued', error: undefined } : op)); }

export function useOutboxSync(owner?: string): void {
  const ops = useOutbox(owner), online = useOnline();
  const currentOwner = useRef(owner);
  useEffect(() => { currentOwner.current = owner; return () => { currentOwner.current = undefined; }; }, [owner]);
  const busy = useRef(false), lastAttempt = useRef<Record<string, number>>({});
  const drain = useCallback(async () => {
    if (!owner || currentOwner.current !== owner || busy.current || !onlineSnapshot()) return;
    const due = dueOps(snapshot(owner), Date.now(), lastAttempt.current);
    if (!due.length) return;
    busy.current = true;
    try {
      for (const op of due) {
        if (currentOwner.current !== owner || !onlineSnapshot()) break;
        commit(owner, snapshot(owner).map((o) => o.id === op.id ? { ...o, status: 'sending' } : o));
        lastAttempt.current[op.id] = Date.now();
        let outcome: SyncOutcome;
        try {
          let payload = op.payload;
          const existingRefs = Array.isArray(payload.mediaRefs) ? payload.mediaRefs as string[] : [];
          if (existingRefs.length !== op.attachments) {
            const blobs = await attachmentsFor(owner, op.id);
            if (blobs.length !== op.attachments) throw new Error('Some attached files are missing from device storage. The record was kept and has not been sent.');
            const mediaRefs: string[] = [];
            for (const stored of blobs) {
              if (currentOwner.current !== owner) throw new Error('The signed-in account changed. Your original device copy was kept.');
              const form = new FormData(); form.append('file', stored.blob, stored.name); form.append('purpose', `offline-${op.kind}`);
              const upload = await fetch('/api/upload', { method: 'POST', body: form, headers: { 'idempotency-key': `${op.id}:${stored.id}` } });
              if (!upload.ok) throw new Error(`Photo upload unavailable (${upload.status}). Your record and files remain on this device.`);
              const uploaded = await upload.json() as { url?: string };
              if (!uploaded.url?.startsWith('https://')) throw new Error('The upload did not return a stored file. Your originals were kept.');
              mediaRefs.push(uploaded.url);
            }
            payload = { ...payload, mediaRefs };
            // Persist returned references before sync so ambiguous network retries keep identical content.
            commit(owner, snapshot(owner).map((o) => o.id === op.id ? { ...o, payload } : o));
          }
          if (currentOwner.current !== owner) throw new Error('The signed-in account changed. Your original device copy was kept.');
          outcome = await syncOperation({ owner, id: op.id, kind: op.kind, capturedISO: op.capturedISO, payload });
        } catch (error) {
          outcome = { ok: false, id: op.id, conflict: false, error: error instanceof Error ? error.message : 'Unable to connect. Your record remains on this device for retry.' };
        }
        commit(owner, snapshot(owner).map((o) => o.id === op.id ? applyOutcome(o, outcome, new Date().toISOString()) : o));
        if (outcome.ok && idbAvailable()) await idbDeleteBlobsFor(op.id, owner);
      }
      const stale = prunable(snapshot(owner), Date.now());
      if (stale.length) commit(owner, snapshot(owner).filter((op) => !stale.includes(op.id)));
    } finally { busy.current = false; }
  }, [owner]);
  useEffect(() => { void hydrateFromIdb(owner).then(drain); }, [owner, drain]);
  useEffect(() => { void drain(); }, [drain, online, ops.length]);
  useEffect(() => { const timer = setInterval(() => { void drain(); }, 10_000); return () => clearInterval(timer); }, [drain]);
}
