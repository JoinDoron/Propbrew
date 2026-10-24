import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), clientQuery: vi.fn(), release: vi.fn(), pool: vi.fn(), on: vi.fn(), end: vi.fn(),
  neon: vi.fn(), neonTag: vi.fn(), neonQuery: vi.fn(), neonTransaction: vi.fn(),
}));
vi.mock('pg', () => ({ Pool: class {
  constructor(config: unknown) { mocks.pool(config); }
  connect = mocks.connect;
  on = mocks.on;
  end = mocks.end;
} }));
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));

import { withTenant } from '@/server/db';
import { postgresConfig } from '@/server/postgres-config.mjs';

const tenantId = '37b176f9-f106-49e4-904d-0821c8fa744e';

beforeEach(() => {
  vi.clearAllMocks();
  delete (globalThis as { __propbrewPgPool?: unknown }).__propbrewPgPool;
  vi.stubEnv('DATABASE_URL', 'postgresql://review@postgres.railway.internal/review');
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [{ value: 'ok' }] });
  mocks.end.mockResolvedValue(undefined);
  mocks.neon.mockReturnValue(Object.assign(mocks.neonTag, { query: mocks.neonQuery, transaction: mocks.neonTransaction }));
  mocks.neonTag.mockReturnValue({ tenant: true });
  mocks.neonQuery.mockReturnValue({ statement: true });
  mocks.neonTransaction.mockResolvedValue([[], [{ value: 'neon' }]]);
});
afterEach(() => vi.unstubAllEnvs());

describe('tenant database transport', () => {
  it('uses one native connection with tenant context before the parameterized statement', async () => {
    const hostileValue = "'; drop table tenants; --";
    await expect(withTenant(tenantId, (query) => query`select ${hostileValue}::text as value`)).resolves.toEqual([{ value: 'ok' }]);
    expect(mocks.clientQuery.mock.calls).toEqual([
      ['BEGIN'],
      ["select set_config('app.tenant_id', $1, true)", [tenantId]],
      ['select $1::text as value', [hostileValue]],
      ['COMMIT'],
    ]);
    expect(mocks.release).toHaveBeenCalledWith(false);
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 15000, ssl: false }));
  });

  it('rolls back errors and releases the connection without committing', async () => {
    const failure = new Error('statement failed');
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure);
    await expect(withTenant(tenantId, (query) => query`select 1`)).rejects.toBe(failure);
    expect(mocks.clientQuery.mock.calls.map(([text]) => text)).toEqual(['BEGIN', "select set_config('app.tenant_id', $1, true)", 'select 1', 'ROLLBACK']);
    expect(mocks.release).toHaveBeenCalledWith(false);
  });

  it('discards a connection if rollback fails, preserving the original error', async () => {
    const failure = new Error('statement failed');
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure).mockRejectedValueOnce(new Error('connection lost'));
    await expect(withTenant(tenantId, (query) => query`select 1`)).rejects.toBe(failure);
    expect(mocks.release).toHaveBeenCalledWith(true);
  });

  it('never executes the statement when tenant context setup fails', async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('context failed'));
    await expect(withTenant(tenantId, (query) => query`select 1`)).rejects.toThrow('context failed');
    expect(mocks.clientQuery.mock.calls.map(([text]) => text)).toEqual(['BEGIN', "select set_config('app.tenant_id', $1, true)", 'ROLLBACK']);
  });

  it('preserves Neon HTTP transactions only for real Neon hosts', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://review@ep-review.us-east-2.aws.neon.tech/review');
    await expect(withTenant(tenantId, (query) => query`select ${'value'}`)).resolves.toEqual([{ value: 'neon' }]);
    expect(mocks.neonQuery).toHaveBeenCalledWith('select $1', ['value']);
    expect(mocks.neonTransaction).toHaveBeenCalledWith([{ tenant: true }, { statement: true }]);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('does not treat a host containing the Neon suffix as Neon', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://review@ep.neon.tech.example.com/review');
    await withTenant(tenantId, (query) => query`select 1`);
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: { rejectUnauthorized: true } }));
  });

  it.each(['t-lekki', '-'.repeat(36), '000000000000000000000000000000000000'])('rejects malformed tenant %s before connecting', async (invalid) => {
    await expect(withTenant(invalid, (query) => query`select 1`)).rejects.toThrow('tenant UUID');
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.neon).not.toHaveBeenCalled();
  });

  it('reuses its bounded pool and leaves query construction lazy', async () => {
    await withTenant(tenantId, (query) => {
      const statement = query`select ${1}`;
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.clientQuery).not.toHaveBeenCalled();
      return statement;
    });
    await withTenant(tenantId, (query) => query`select ${2}`);
    expect(mocks.pool).toHaveBeenCalledTimes(1);
  });
});

describe('native PostgreSQL TLS policy', () => {
  it.each(['postgres.railway.internal', 'localhost', '127.0.0.1', '[::1]'])('allows private or loopback transport for %s', (host) => {
    expect(postgresConfig(`postgresql://review@${host}/review`).ssl).toBe(false);
  });
  it('forces verified TLS on public connections even with sslmode=require', () => {
    const config = postgresConfig('postgresql://review@db.example.com/review?sslmode=require');
    expect(new URL(config.connectionString).searchParams.get('sslmode')).toBe('verify-full');
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });
  it.each(['disable', 'no-verify', 'prefer', 'allow'])('rejects public TLS downgrade %s', (mode) => {
    expect(() => postgresConfig(`postgresql://review@db.example.com/review?sslmode=${mode}`)).toThrow('verified TLS');
  });
});
