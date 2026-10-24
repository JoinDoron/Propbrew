import 'server-only';
import { neon } from '@neondatabase/serverless';
import { Pool, type PoolClient } from 'pg';
import { log } from '@/lib/logger';
import { postgresConfig } from './postgres-config.mjs';
import { currentRecordContext } from './data/record-context';

type Statement = { text: string; values: unknown[] };
export type TaggedQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Statement;

// Building a statement never opens a connection or executes outside tenant RLS.
const query: TaggedQuery = (strings, ...values) => {
  if (!strings.raw || strings.length !== values.length + 1) throw new Error('Use a tagged SQL template.');
  return { text: strings.reduce((text, part, index) => `${text}${index ? `$${index}` : ''}${part}`, ''), values };
};

const databaseGlobal = globalThis as typeof globalThis & { __propbrewPgPool?: { url: string; pool: Pool } };

type DatabaseIdentity = { userId: string; sessionId: string };
function databaseIdentity(): DatabaseIdentity | undefined {
  const principal = currentRecordContext()?.companyPrincipal;
  if (!principal) return;
  const identity = { userId: principal.user.id, sessionId: principal.session.id };
  if (![identity.userId, identity.sessionId].every((value) => /^[0-9a-f-]{36}$/i.test(value))) throw new Error('A verified database session is required.');
  return identity;
}
async function bindIdentity(client: PoolClient, identity: DatabaseIdentity | undefined) {
  if (!identity) return;
  await client.query("select set_config('app.auth_user_id',$1,true),set_config('app.auth_session_id',$2,true)", [identity.userId, identity.sessionId]);
}

function nativePool(url: string): Pool {
  if (databaseGlobal.__propbrewPgPool?.url === url) return databaseGlobal.__propbrewPgPool.pool;
  const pool = new Pool(postgresConfig(url));
  pool.on('error', () => log('error', 'An idle database connection failed.'));
  const previous = databaseGlobal.__propbrewPgPool;
  databaseGlobal.__propbrewPgPool = { url, pool };
  if (previous) void previous.pool.end().catch(() => {});
  return pool;
}

/** Interactive native transaction for atomic operational mutations. Unlike the
 * HTTP statement helper, this keeps tenant context and every read/write on one
 * checked-out connection until the callback has completed. */
export async function withTenantTransaction<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('A valid tenant UUID is required.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for the durable data adapter.');
  const client = await nativePool(url).connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId.toLowerCase()]);
    await bindIdentity(client, databaseIdentity());
    const result = await fn(client);
    const completion = await client.query('COMMIT');
    if (completion.command !== 'COMMIT') throw new Error('The operational database transaction did not commit.');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    throw error;
  } finally { client.release(destroy); }
}

/** Execute one parameterized statement with transaction-local tenant context. */
export async function withTenant<T = Record<string, unknown>[]>(tenantId: string, fn: (query: TaggedQuery) => Statement): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('A valid tenant UUID is required.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for the durable data adapter.');
  const statement = fn(query);
  const identity = databaseIdentity();

  if (new URL(url).hostname.endsWith('.neon.tech')) {
    const client = neon(url);
    const statements = [
      client`select set_config('app.tenant_id', ${tenantId}, true)`,
      ...(identity ? [client`select set_config('app.auth_user_id',${identity.userId},true),set_config('app.auth_session_id',${identity.sessionId},true)`] : []),
      client.query(statement.text, statement.values),
    ];
    const results = await client.transaction(statements);
    return results.at(-1) as T;
  }

  const client = await nativePool(url).connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    await bindIdentity(client, identity);
    const result = await client.query(statement.text, statement.values);
    await client.query('COMMIT');
    return result.rows as T;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    throw error;
  } finally {
    client.release(destroy);
  }
}
