import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { CompanyPrincipal } from '@/server/auth/company';

export type WorkspaceRecordState = {
  schemaVersion: 1;
  collections: Record<string, unknown>;
  history: Record<string, unknown[]>;
  auxiliary: Record<string, unknown>;
  sequences: Record<string, number>;
};
export type RecordContext = { state: WorkspaceRecordState; domainTenantId: string; mode: 'read' | 'write'; retainedSyncReceipts?: Record<string, unknown>[]; companyPrincipal?: CompanyPrincipal };
const root = globalThis as typeof globalThis & { __propbrewRecordContext?: AsyncLocalStorage<RecordContext> };
const contexts = root.__propbrewRecordContext ??= new AsyncLocalStorage<RecordContext>();
const localAuxiliary: Record<string, unknown> = Object.create(null);
const localSequences: Record<string, number> = Object.create(null);

export const durableRecordsEnabled = () => process.env.DATA_SOURCE === 'postgres';
export const currentRecordContext = () => contexts.getStore();
export function runWithRecordContext<T>(context: RecordContext, fn: () => T): T { return contexts.run(context, fn); }

/** Sidecars join the same transaction as the records they describe. */
export function getRecordAuxiliary<T>(key: string, initialize: () => T): T {
  const context = currentRecordContext();
  if (!context && durableRecordsEnabled()) throw new Error('A database record context is required.');
  const values = context?.state.auxiliary ?? localAuxiliary;
  if (!Object.hasOwn(values, key)) values[key] = initialize();
  return values[key] as T;
}

/** Business references are allocated under the workspace database lock. */
export function nextRecordSequence(key: string, initial: number, preIncrement = false): number {
  const context = currentRecordContext();
  if (!context && durableRecordsEnabled()) throw new Error('A database record context is required.');
  if (context?.mode === 'read') throw new Error('A read cannot allocate a record reference.');
  const values = context?.state.sequences ?? localSequences;
  const previous = values[key] ?? initial;
  if (!Number.isSafeInteger(previous) || previous >= Number.MAX_SAFE_INTEGER) throw new Error('Record reference sequence is invalid.');
  values[key] = previous + 1;
  return preIncrement ? previous + 1 : previous;
}

/** A rejected offline transition still needs its owned recovery receipt. Only
 * this metadata survives a declined mutation; domain changes are rolled back. */
export function retainPendingSyncReceipt(receipt: Record<string, unknown>): void {
  const context = currentRecordContext();
  if (!context) return;
  if (context.mode !== 'write' || receipt.tenantId !== context.domainTenantId || receipt.status !== 'pending'
    || typeof receipt.actorId !== 'string' || typeof receipt.opId !== 'string' || typeof receipt.payloadHash !== 'string') throw new Error('Invalid offline recovery receipt.');
  (context.retainedSyncReceipts ??= []).push(structuredClone(receipt));
}
