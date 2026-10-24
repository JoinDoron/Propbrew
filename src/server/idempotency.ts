import 'server-only';
import { withTenant } from '@/server/db';

type Entry = { response: unknown; expiresAt: number };
const memory = new Map<string, Entry>();

/** Request replay protection seam; production callers should back this with idempotency_keys. */
export async function once<T>(tenantId: string, key: string, fn: () => Promise<T>): Promise<T> {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new Error('Invalid idempotency key.');
  const id = `${tenantId}:${key}`;
  // Use the durable ledger when a UUID tenant and database are configured;
  // local/demo identities retain the deterministic in-memory fallback.
  if (process.env.DATABASE_URL && /^[0-9a-f-]{36}$/i.test(tenantId)) {
    const rows = await withTenant(tenantId, (query) => query`
      select response from idempotency_keys where tenant_id = ${tenantId}::uuid and key = ${key} limit 1
    `) as Array<{ response: T }>;
    if (rows[0]) return rows[0].response;
    const response = await fn();
    await withTenant(tenantId, (query) => query`
      insert into idempotency_keys (tenant_id, key, response)
      values (${tenantId}::uuid, ${key}, ${JSON.stringify(response)}::jsonb)
      on conflict (tenant_id, key) do nothing
    `);
    return response;
  }
  const prior = memory.get(id);
  if (prior && prior.expiresAt > Date.now()) return prior.response as T;
  const response = await fn();
  memory.set(id, { response, expiresAt: Date.now() + 24 * 3600 * 1000 });
  return response;
}
