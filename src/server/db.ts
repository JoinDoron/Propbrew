import 'server-only';
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';
import { log } from '@/lib/logger';
import { postgresConfig } from './postgres-config.mjs';

type Statement = { text: string; values: unknown[] };
export type TaggedQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Statement;

// Building a statement never opens a connection or executes outside tenant RLS.
const query: TaggedQuery = (strings, ...values) => {
  if (!strings.raw || strings.length !== values.length + 1) throw new Error('Use a tagged SQL template.');
  return { text: strings.reduce((text, part, index) => `${text}${index ? `$${index}` : ''}${part}`, ''), values };
};

const databaseGlobal = globalThis as typeof globalThis & { __propbrewPgPool?: { url: string; pool: Pool } };

function nativePool(url: string): Pool {
  if (databaseGlobal.__propbrewPgPool?.url === url) return databaseGlobal.__propbrewPgPool.pool;
  const pool = new Pool(postgresConfig(url));
  pool.on('error', () => log('error', 'An idle database connection failed.'));
  const previous = databaseGlobal.__propbrewPgPool;
  databaseGlobal.__propbrewPgPool = { url, pool };
  if (previous) void previous.pool.end().catch(() => {});
  return pool;
}

/** Execute one parameterized statement with transaction-local tenant context. */
export async function withTenant<T = Record<string, unknown>[]>(tenantId: string, fn: (query: TaggedQuery) => Statement): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('A valid tenant UUID is required.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for the durable data adapter.');
  const statement = fn(query);

  if (new URL(url).hostname.endsWith('.neon.tech')) {
    const client = neon(url);
    const [, result] = await client.transaction([
      client`select set_config('app.tenant_id', ${tenantId}, true)`,
      client.query(statement.text, statement.values),
    ]);
    return result as T;
  }

  const client = await nativePool(url).connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
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
