import 'server-only';
import { cookies } from 'next/headers';
import { REVIEW_SESSION_COOKIE, assertReviewReadiness, reviewLedgerTenantId, reviewModeEnabled, verifyReviewSession } from '@/server/review-auth';
import { identityByKey } from '@/server/identities';
import { currentRecordContext, durableRecordsEnabled, runWithRecordContext } from './record-context';
import { initialWorkspaceRecordState, validateWorkspaceRecordState } from './store';
import { withWorkspaceState } from './workspace-postgres';

/** Authenticate the signed identity BEFORE loading records or reconstructing creator grants. */
async function verifiedStorageIdentity() {
  if (!reviewModeEnabled()) throw new Error('Durable operational storage requires a configured, verified workspace identity.');
  assertReviewReadiness();
  const token = (await cookies()).get(REVIEW_SESSION_COOKIE)?.value;
  if (!verifyReviewSession(token)) return null;
  const tenantId = reviewLedgerTenantId();
  const domainTenantId = identityByKey('estate_manager').actor.tenantId;
  if (!tenantId || !domainTenantId) throw new Error('The authenticated workspace storage mapping is missing.');
  return { tenantId, domainTenantId };
}

export async function withDurableRead<T>(fn: () => Promise<T>): Promise<T> {
  if (!durableRecordsEnabled() || currentRecordContext()) return fn();
  const identity = await verifiedStorageIdentity();
  // The existing page/API authentication handles its normal redirect or 401.
  if (!identity) return fn();
  return withWorkspaceState(identity.tenantId, identity.domainTenantId, 'read', () => initialWorkspaceRecordState(identity.domainTenantId), async (payload) => {
    const state = validateWorkspaceRecordState(payload, identity.domainTenantId);
    return { value: await runWithRecordContext({ state, domainTenantId: identity.domainTenantId, mode: 'read' }, fn) };
  });
}

export async function withDurableMutation<T>(fn: () => Promise<T>): Promise<T> {
  if (!durableRecordsEnabled() || currentRecordContext()?.mode === 'write') return fn();
  const identity = await verifiedStorageIdentity();
  if (!identity) return fn();
  return withWorkspaceState(identity.tenantId, identity.domainTenantId, 'write', () => initialWorkspaceRecordState(identity.domainTenantId), async (payload) => {
    const state = validateWorkspaceRecordState(payload, identity.domainTenantId);
    const before = structuredClone(state);
    const context = { state, domainTenantId: identity.domainTenantId, mode: 'write' as const, retainedSyncReceipts: [] as Record<string, unknown>[] };
    const value = await runWithRecordContext(context, fn);
    const failed = value && typeof value === 'object' && 'ok' in value && value.ok === false;
    const output = failed ? before : state;
    if (failed && context.retainedSyncReceipts.length) {
      const ledger = output.collections.syncLedger as Record<string, unknown>[];
      for (const receipt of context.retainedSyncReceipts) {
        if (!ledger.some((row) => row.tenantId === receipt.tenantId && row.actorId === receipt.actorId && row.opId === receipt.opId)) ledger.push(receipt);
      }
    }
    validateWorkspaceRecordState(output, identity.domainTenantId);
    return { value, payload: output, commit: !failed || context.retainedSyncReceipts.length > 0 };
  });
}
