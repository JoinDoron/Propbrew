import 'server-only';

import { withTenant } from '@/server/db';

export type DurableRow = { tenantId: string; id: string; [key: string]: unknown };

/**
 * Durable JSONB repository used as the migration seam for the broad domain
 * surface.  Every operation sets the tenant RLS variable inside the same
 * transaction, so a missing/forged tenant can never widen the result set.
 */
export async function listDurableRows<T extends DurableRow>(tenantId: string, entity: string, limit = 100): Promise<T[]> {
  const rows = await withTenant(tenantId, (query) => query`
      select payload
      from domain_rows
      where tenant_id = ${tenantId}::uuid and entity = ${entity}
      order by updated_at desc
      limit ${Math.max(1, Math.min(limit, 500))}
    `) as Array<{ payload: T }>;
  return rows.map((row) => row.payload);
}

export async function getDurableRow<T extends DurableRow>(tenantId: string, entity: string, id: string): Promise<T | null> {
  const rows = await withTenant(tenantId, (query) => query`
      select payload
      from domain_rows
      where tenant_id = ${tenantId}::uuid and entity = ${entity} and row_id = ${id}
      limit 1
    `) as Array<{ payload: T }>;
  return rows[0]?.payload ?? null;
}

export async function upsertDurableRow<T extends DurableRow>(tenantId: string, entity: string, row: T): Promise<void> {
  if (row.tenantId !== tenantId) throw new Error('Cross-tenant durable write denied.');
  await withTenant(tenantId, (query) => query`
      insert into domain_rows (tenant_id, entity, row_id, payload)
      values (${tenantId}::uuid, ${entity}, ${row.id}, ${JSON.stringify(row)}::jsonb)
      on conflict (tenant_id, entity, row_id)
      do update set payload = excluded.payload, version = domain_rows.version + 1, updated_at = now()
    `);
}
