import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { postgresConfig } from '../src/server/postgres-config.mjs';

export async function runMigrations({ url = process.env.DATABASE_UNPOOLED_URL || process.env.DATABASE_URL, directory = resolve('db/migrations') } = {}) {
  if (!url) throw new Error('DATABASE_URL is required to run PostgreSQL migrations.');
  const client = new Client({ ...postgresConfig(url), statement_timeout: 60_000, query_timeout: 65_000, application_name: 'propbrew-migrate' });
  await client.connect();
  try {
    // Serialize deploys, including the initial creation of the migration ledger.
    await client.query("select pg_advisory_lock(hashtextextended('propbrew:schema_migrations', 0))");
    await client.query('create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())');
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const applied = await client.query('select filename from schema_migrations where filename = $1', [file]);
      if (applied.rows.length) { console.log(`Skipped ${file}`); continue; }
      const body = await readFile(resolve(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        // Send the whole file so dollar-quoted function bodies stay intact.
        await client.query(body);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.log(`Applied ${file}`);
    }
  } finally {
    // Closing this dedicated connection also releases its session advisory lock.
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runMigrations();
