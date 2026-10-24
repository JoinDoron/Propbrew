import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { postgresConfig } from '@/server/postgres-config.mjs';

const root = globalThis as typeof globalThis & { __propbrewAuthPool?: { url: string; pool: Pool } };
export function authDatabasePool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('The account database is not configured.');
  if (root.__propbrewAuthPool?.url === url) return root.__propbrewAuthPool.pool;
  const pool = new Pool({ ...postgresConfig(url), application_name: 'propbrew-auth' });
  pool.on('error', () => console.error('An account database connection was interrupted.'));
  root.__propbrewAuthPool = { url, pool };
  return pool;
}

export async function withAuthTransaction<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('A verified account is required.');
  const client = await authDatabasePool().connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.auth_user_id', $1, true)", [userId]);
    const result = await fn(client);
    const completion = await client.query('COMMIT');
    if (completion.command !== 'COMMIT') throw new Error('The account change did not commit.');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    throw error;
  } finally { client.release(destroy); }
}
