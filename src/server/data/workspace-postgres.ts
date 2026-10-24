import 'server-only';

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/server/db';

const MAX_BYTES = 32 * 1024 * 1024;
type StoredWorkspace = { domain_tenant_id: string; payload: unknown; version: string };
type Outcome<T> = { value: T; payload?: unknown; commit?: boolean };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Validate only the envelope here; domain authorization/validation remains in
 * the existing actions. Optional undefined fields follow ordinary JSON rules. */
function encoded(payload: unknown): string {
  if (!object(payload) || payload.schemaVersion !== 1 || !object(payload.collections) || !object(payload.history) || !object(payload.auxiliary) || !object(payload.sequences)) throw new Error('Workspace state has an invalid versioned envelope.');
  if (Object.values(payload.history).some((entries) => !Array.isArray(entries)) || Object.values(payload.sequences).some((value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) throw new Error('Workspace history or sequence state is invalid.');
  let result: string;
  try {
    result = JSON.stringify(payload, (_key, value: unknown) => {
      if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'number' && !Number.isFinite(value)) throw new Error();
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !object(value)) throw new Error();
      return value;
    });
  } catch { throw new Error('Workspace state must contain finite, JSON-safe records.'); }
  if (Buffer.byteLength(result, 'utf8') > MAX_BYTES) throw new Error('Workspace state exceeds the supported storage size.');
  return result;
}

function detached(payload: unknown): unknown { return JSON.parse(encoded(payload)); }
function namespace(domainTenantId: string): void {
  if (typeof domainTenantId !== 'string' || !domainTenantId.trim() || domainTenantId.length > 200 || /[\u0000-\u001f\u007f]/.test(domainTenantId)) throw new Error('A valid logical workspace tenant is required.');
}
function checked(row: StoredWorkspace, domainTenantId: string): StoredWorkspace {
  if (row.domain_tenant_id !== domainTenantId) throw new Error('Workspace tenant identity does not match its stored namespace.');
  encoded(row.payload);
  return row;
}
async function select(client: PoolClient, tenantId: string, lock = false): Promise<StoredWorkspace | undefined> {
  const result = await client.query<StoredWorkspace>(`select domain_tenant_id, payload, version::text as version from workspace_records where tenant_id = $1::uuid${lock ? ' for update' : ''}`, [tenantId]);
  return result.rows[0];
}
async function locked(client: PoolClient, tenantId: string, domainTenantId: string, initialize: () => unknown): Promise<StoredWorkspace> {
  // This covers the empty-row case as well as all later writes, and coordinates
  // independent processes. A row lock alone cannot serialize first creation.
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 812649))', [tenantId]);
  const existing = await select(client, tenantId, true);
  if (existing) return checked(existing, domainTenantId);
  const payload = encoded(initialize());
  const result = await client.query<StoredWorkspace>('insert into workspace_records(tenant_id, domain_tenant_id, payload) values ($1::uuid, $2, $3::jsonb) returning domain_tenant_id, payload, version::text as version', [tenantId, domainTenantId, payload]);
  return checked(result.rows[0], domainTenantId);
}
class DeclinedWorkspace<T> extends Error { constructor(readonly value: T) { super('Workspace mutation declined.'); } }

/**
 * Reads release the database transaction before invoking the callback (which may
 * call a provider). Writes lock, hydrate, run local mutations and commit before
 * returning. No cache or background flush can acknowledge an uncommitted save.
 */
export async function withWorkspaceState<T>(
  tenantId: string,
  domainTenantId: string,
  mode: 'read' | 'write',
  initialize: () => unknown,
  fn: (payload: unknown) => Promise<Outcome<T>>,
  authorize?: (client: PoolClient) => Promise<void>,
): Promise<T> {
  namespace(domainTenantId);
  if (typeof tenantId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('A valid tenant UUID is required.');
  if (mode !== 'read' && mode !== 'write') throw new Error('Choose a valid workspace storage operation.');
  const canonicalTenantId = tenantId.toLowerCase();
  if (mode === 'read') {
    const payload = await withTenantTransaction(canonicalTenantId, async (client) => {
      if (authorize) await authorize(client);
      const row = await select(client, canonicalTenantId);
      return detached((row ? checked(row, domainTenantId) : await locked(client, canonicalTenantId, domainTenantId, initialize)).payload);
    });
    return (await fn(payload)).value;
  }
  try {
    return await withTenantTransaction(canonicalTenantId, async (client) => {
      // Membership changes and sandbox resets use this same lock. Check the
      // verified session before reading even the first stored record.
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 812649))', [canonicalTenantId]);
      if (authorize) await authorize(client);
      const row = await locked(client, canonicalTenantId, domainTenantId, initialize);
      const payload = detached(row.payload);
      const outcome = await fn(payload);
      if (outcome.commit === false) throw new DeclinedWorkspace(outcome.value);
      const updated = await client.query('update workspace_records set payload = $1::jsonb, version = version + 1, updated_at = now() where tenant_id = $2::uuid and domain_tenant_id = $3 and version = $4::bigint returning version', [encoded(outcome.payload === undefined ? payload : outcome.payload), canonicalTenantId, domainTenantId, row.version]);
      if (updated.rowCount !== 1) throw new Error('Workspace state changed before it could be committed.');
      return outcome.value;
    });
  } catch (error) {
    if (error instanceof DeclinedWorkspace) return error.value as T;
    throw error;
  }
}
