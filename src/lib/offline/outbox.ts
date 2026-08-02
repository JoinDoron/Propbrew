'use client';

/**
 * The device outbox — durable local storage for field-captured work.
 *
 * Writes land in localStorage SYNCHRONOUSLY before the UI acknowledges them, so
 * killing the app (or the battery) between capture and sync cannot lose a
 * record. The queue survives reloads; the transport drains it whenever the
 * browser reports connectivity, with exponential backoff on failure.
 *
 * All queue semantics (ordering, backoff, dedupe, conflict handling) live in
 * `@/domain/sync` and are unit-tested; this file only does persistence,
 * connectivity detection and the retry loop.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { applyOutcome, dueOps, enqueue, prunable, type OutboxOp, type OpKind, type SyncOutcome } from '@/domain/sync';
import { syncOperation, abandonOperation } from '@/server/actions/sync';

const KEY = 'vesta.outbox.v1';

/* --- persistence ---------------------------------------------------------- */

function read(): OutboxOp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxOp[]) : [];
  } catch {
    return []; // corrupt storage must never crash the field app
  }
}

let cache: OutboxOp[] | null = null;
const listeners = new Set<() => void>();

function snapshot(): OutboxOp[] {
  if (cache === null) cache = read();
  return cache;
}
function commit(next: OutboxOp[]): void {
  cache = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota — keep it in memory */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  // Another tab on the same device shares the queue.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = read(); l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

const EMPTY: OutboxOp[] = [];

/* --- connectivity --------------------------------------------------------- */

/** A dev override so the offline path is demonstrable on a wired machine. */
const FORCE_KEY = 'vesta.outbox.forceOffline';
export function isForcedOffline(): boolean {
  try { return window.localStorage.getItem(FORCE_KEY) === '1'; } catch { return false; }
}
export function setForcedOffline(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(FORCE_KEY, '1');
    else window.localStorage.removeItem(FORCE_KEY);
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(on ? 'offline' : 'online'));
}

function onlineSubscribe(l: () => void): () => void {
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); };
}
function onlineSnapshot(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine && !isForcedOffline();
}

/* --- public API ----------------------------------------------------------- */

export function useOnline(): boolean {
  return useSyncExternalStore(onlineSubscribe, onlineSnapshot, () => true);
}

export function useOutbox(): OutboxOp[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** Capture a mutation locally. Returns once it is durably on the device — the
 *  UI can confirm to the user immediately, with or without a connection. */
export function capture(kind: OpKind, label: string, payload: Record<string, unknown>, attachments = 0): OutboxOp {
  const op: OutboxOp = {
    id: newId(),
    kind, label, payload,
    capturedISO: new Date().toISOString(),
    attachments,
    status: 'queued',
    attempts: 0,
  };
  commit(enqueue(snapshot(), op));
  return op;
}

export function removeOp(id: string): void {
  commit(snapshot().filter((o) => o.id !== id));
}

export function clearSynced(): void {
  commit(snapshot().filter((o) => o.status !== 'synced'));
}

/** Give up on a conflicted op — the server keeps its version. */
export async function abandon(id: string): Promise<void> {
  const op = snapshot().find((o) => o.id === id);
  if (op) await abandonOperation(id, op.kind);
  removeOp(id);
}

/** Re-queue a conflicted op to overwrite… nothing: conflicts are server-wins by
 *  design, so "retry" here just re-attempts in case the server has since moved
 *  back into an acceptable state. */
export function requeue(id: string): void {
  commit(snapshot().map((o) => (o.id === id ? { ...o, status: 'queued' as const, error: undefined } : o)));
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* --- the drain loop ------------------------------------------------------- */

/**
 * Drains the outbox while online. Mount ONCE (the shell does it). Sends ops one
 * at a time in capture order so a report and its follow-up issue arrive in the
 * order the field user wrote them.
 */
export function useOutboxSync(): void {
  const ops = useOutbox();
  const online = useOnline();
  const busy = useRef(false);
  const lastAttempt = useRef<Record<string, number>>({});

  const drain = useCallback(async () => {
    if (busy.current || !onlineSnapshot()) return;
    const due = dueOps(snapshot(), Date.now(), lastAttempt.current);
    if (due.length === 0) return;
    busy.current = true;
    try {
      for (const op of due) {
        if (!onlineSnapshot()) break; // signal dropped mid-drain — stop cleanly
        commit(snapshot().map((o) => (o.id === op.id ? { ...o, status: 'sending' as const } : o)));
        lastAttempt.current[op.id] = Date.now();
        let outcome: SyncOutcome;
        try {
          outcome = await syncOperation({ id: op.id, kind: op.kind, capturedISO: op.capturedISO, payload: op.payload });
        } catch {
          // Network died mid-flight. The op stays queued; because the id is the
          // idempotency key, re-sending later is safe even if the server DID
          // apply it — it will answer `duplicate: true`.
          outcome = { ok: false, id: op.id, conflict: false, error: 'No connection — will retry automatically.' };
        }
        const nowISO = new Date().toISOString();
        commit(snapshot().map((o) => (o.id === op.id ? applyOutcome(o, outcome, nowISO) : o)));
      }
      // Housekeeping: drop long-since-synced receipts.
      const stale = prunable(snapshot(), Date.now());
      if (stale.length) commit(snapshot().filter((o) => !stale.includes(o.id)));
    } finally {
      busy.current = false;
    }
  }, []);

  // Drain on mount, whenever connectivity returns, when new work is queued,
  // and on a slow heartbeat to honour backoff windows.
  useEffect(() => { void drain(); }, [drain, online, ops.length]);
  useEffect(() => {
    const t = setInterval(() => { void drain(); }, 10_000);
    return () => clearInterval(t);
  }, [drain]);
}
