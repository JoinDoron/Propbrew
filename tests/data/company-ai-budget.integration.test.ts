import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../scripts/migrate.mjs';

// Opt in only against a disposable loopback database. Run this suite separately
// from other budget suites because its administrator changes the shared policy.
const testUrl = process.env.PROPBREW_TEST_DATABASE_URL;
if (testUrl && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(testUrl).hostname)) throw new Error('Company budget tests require a disposable loopback database.');
const tenantA = randomUUID(), tenantB = randomUUID(), userA = randomUUID(), userB = randomUUID();
const runtimeRole = 'propbrew_review_app';
const signature = 'reserve_company_copilot_budget(uuid,uuid,text,text,text,bigint,bigint,bigint)';
let admin: Client;
let runtimeUrl: string;
let initialCap: string;

async function runtime<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: runtimeUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function reserve(tenantId: string, actorId: string, reserved: number, input: { context?: string; request?: string; tenantCap?: number | null; featureCap?: number | null } = {}) {
  return runtime(async (client) => {
    await client.query('begin');
    try {
      await client.query("select set_config('app.tenant_id',$1,true)", [input.context ?? tenantId]);
      const result = await client.query('select * from reserve_company_copilot_budget($1::uuid,$2::uuid,$3,$4,$5,$6::bigint,$7::bigint,$8::bigint)', [
        tenantId, input.request ?? randomUUID(), actorId, 'estate_copilot', 'test-model', reserved,
        input.tenantCap === undefined ? 1000 : input.tenantCap, input.featureCap === undefined ? 1000 : input.featureCap,
      ]);
      await client.query('commit');
      return result.rows[0] as { allowed: boolean; reason: string | null };
    } catch (error) { await client.query('rollback'); throw error; }
  });
}

const globalTotals = async () => (await admin.query('select count(*)::int requests,coalesce(sum(reserved_cost_minor_ngn),0)::text reserved from ai_company_budget_reservations where budget_day=(now() at time zone \'UTC\')::date')).rows[0];

describe.skipIf(!testUrl)('shared native company AI budget ceiling', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: testUrl }); await admin.connect();
    await admin.query(`do $$ begin if not exists(select from pg_roles where rolname='${runtimeRole}') then create role ${runtimeRole} login nosuperuser nocreatedb nocreaterole noinherit; end if; end $$`);
    await runMigrations({ url: testUrl });
    initialCap = (await admin.query('select daily_cap_minor_ngn::text cap from ai_company_budget_policy where singleton')).rows[0].cap;
    if ((await admin.query('select count(*)::int n from ai_company_budget_reservations')).rows[0].n !== 0) throw new Error('This suite requires an empty disposable platform budget database.');
    await admin.query(`grant usage on schema public to ${runtimeRole}`);
    await admin.query('insert into auth_users(id,name,email,"createdAt","updatedAt") values($1,$2,$3,now(),now()),($4,$5,$6,now(),now())', [userA, 'Budget test A', `${userA}@example.test`, userB, 'Budget test B', `${userB}@example.test`]);
    await admin.query('insert into tenants(id,name) values($1,$2),($3,$4)', [tenantA, 'Budget company A', tenantB, 'Budget company B']);
    await admin.query('insert into company_memberships(tenant_id,user_id,company_role,modules) values($1,$2,\'owner\',\'{"estate":"manage"}\'::jsonb),($3,$4,\'owner\',\'{"estate":"manage"}\'::jsonb)', [tenantA, userA, tenantB, userB]);
    const url = new URL(testUrl!); url.username = runtimeRole; url.password = ''; runtimeUrl = url.toString();
  });

  beforeEach(async () => {
    await admin.query('delete from ai_company_budget_reservations where tenant_id=any($1::uuid[])', [[tenantA, tenantB]]);
    await admin.query('delete from ai_copilot_usage where tenant_id=any($1::uuid[])', [[tenantA, tenantB]]);
    await admin.query('delete from ai_feature_controls where tenant_id=any($1::uuid[])', [[tenantA, tenantB]]);
    await admin.query('update company_memberships set status=\'active\' where tenant_id=any($1::uuid[])', [[tenantA, tenantB]]);
    await admin.query('update tenants set status=\'active\' where id=any($1::uuid[])', [[tenantA, tenantB]]);
    await admin.query('update ai_company_budget_policy set daily_cap_minor_ngn=100 where singleton');
  });

  afterAll(async () => {
    if (admin) {
      await admin.query('update ai_company_budget_policy set daily_cap_minor_ngn=$1 where singleton', [initialCap ?? '500000']).catch(() => {});
      await admin.end();
    }
  });

  it('starts at the bounded platform allowance and exposes only execution to runtime callers', async () => {
    expect(initialCap).toBe('500000');
    const privileges = (await admin.query('select has_function_privilege($1,$2,\'execute\') execute,has_table_privilege($1,\'ai_company_budget_policy\',\'select\') policy_read,has_table_privilege($1,\'ai_company_budget_reservations\',\'select\') global_read,has_table_privilege($1,\'ai_company_budget_policy\',\'update\') policy_write', [runtimeRole, signature])).rows[0];
    expect(privileges).toEqual({ execute: true, policy_read: false, global_read: false, policy_write: false });
    const functionInfo = (await admin.query('select prosecdef,proconfig,exists(select from aclexplode(coalesce(p.proacl,acldefault(\'f\',p.proowner))) a where a.grantee=0 and a.privilege_type=\'EXECUTE\') public_execute from pg_proc p where oid=$1::regprocedure', [signature])).rows[0];
    expect(functionInfo).toMatchObject({ prosecdef: true, proconfig: ['search_path=pg_catalog, public'], public_execute: false });
    await expect(runtime((client) => client.query('select * from ai_company_budget_policy'))).rejects.toThrow('permission denied');
    await expect(runtime((client) => client.query('update ai_company_budget_policy set daily_cap_minor_ngn=500000'))).rejects.toThrow('permission denied');
    await expect(admin.query('update ai_company_budget_policy set daily_cap_minor_ngn=500001')).rejects.toThrow('check constraint');
  });

  it('shares a single daily ceiling across two otherwise independent companies', async () => {
    expect(await reserve(tenantA, userA, 60)).toEqual({ allowed: true, reason: null });
    expect(await reserve(tenantB, userB, 40)).toEqual({ allowed: true, reason: null });
    expect(await reserve(tenantB, userB, 1)).toEqual({ allowed: false, reason: 'global_daily_budget_exceeded' });
    expect(await globalTotals()).toEqual({ requests: 2, reserved: '100' });
  });

  it('serializes concurrent reservations across companies without overspending', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => reserve(index % 2 ? tenantA : tenantB, index % 2 ? userA : userB, 25)));
    expect(results.filter((result) => result.allowed)).toHaveLength(4);
    expect(results.filter((result) => !result.allowed).every((result) => result.reason === 'global_daily_budget_exceeded')).toBe(true);
    expect(await globalTotals()).toEqual({ requests: 4, reserved: '100' });
    expect((await admin.query('select count(*)::int n from ai_copilot_usage where tenant_id=any($1::uuid[])', [[tenantA, tenantB]])).rows[0].n).toBe(4);
  });

  it('does not charge the platform when tenant or feature reservations are refused', async () => {
    expect(await reserve(tenantA, userA, 50, { tenantCap: 10 })).toEqual({ allowed: false, reason: 'tenant_daily_budget_exceeded' });
    expect(await reserve(tenantA, userA, 50, { featureCap: 10 })).toEqual({ allowed: false, reason: 'feature_daily_budget_exceeded' });
    expect(await globalTotals()).toEqual({ requests: 0, reserved: '0' });
    expect(await reserve(tenantB, userB, 100)).toEqual({ allowed: true, reason: null });
  });

  it('refuses duplicate request IDs without authorizing another call or charging twice', async () => {
    const request = randomUUID();
    expect(await reserve(tenantA, userA, 60, { request })).toEqual({ allowed: true, reason: null });
    expect(await reserve(tenantA, userA, 60, { request })).toEqual({ allowed: false, reason: 'request_already_reserved' });
    expect(await globalTotals()).toEqual({ requests: 1, reserved: '60' });
  });

  it('keeps the reservation after a zero-usage error and resets only the UTC-day window', async () => {
    const request = randomUUID(); await reserve(tenantA, userA, 60, { request });
    await admin.query('begin');
    await admin.query('select set_config(\'app.tenant_id\',$1,true)', [tenantA]);
    await admin.query('select finish_copilot_budget($1,$2,0,0,0,\'error\',\'\',\'\',\'\')', [tenantA, request]);
    await admin.query('commit');
    expect(await reserve(tenantB, userB, 60)).toEqual({ allowed: false, reason: 'global_daily_budget_exceeded' });
    expect(await globalTotals()).toEqual({ requests: 1, reserved: '60' });
    await admin.query('update ai_company_budget_reservations set budget_day=(now() at time zone \'UTC\')::date-1 where tenant_id=$1', [tenantA]);
    expect(await reserve(tenantB, userB, 100)).toEqual({ allowed: true, reason: null });
    expect(await globalTotals()).toEqual({ requests: 1, reserved: '100' });
  });

  it('treats an explicit zero platform policy as a manual suspension', async () => {
    await admin.query('update ai_company_budget_policy set daily_cap_minor_ngn=0');
    expect(await reserve(tenantA, userA, 0)).toEqual({ allowed: false, reason: 'global_daily_budget_exceeded' });
    expect(await reserve(tenantB, userB, 1)).toEqual({ allowed: false, reason: 'global_daily_budget_exceeded' });
    expect(await globalTotals()).toEqual({ requests: 0, reserved: '0' });
  });

  it('rejects tenant mismatch, foreign actors, revoked members and suspended companies before reservation', async () => {
    await expect(reserve(tenantA, userA, 1, { context: tenantB })).rejects.toThrow('Tenant context mismatch');
    await expect(reserve(tenantA, userB, 1)).rejects.toThrow('active company membership');
    await admin.query('update company_memberships set status=\'revoked\' where tenant_id=$1', [tenantA]);
    await expect(reserve(tenantA, userA, 1)).rejects.toThrow('active company membership');
    await admin.query('update tenants set status=\'suspended\' where id=$1', [tenantB]);
    await expect(reserve(tenantB, userB, 1)).rejects.toThrow('active company membership');
    expect(await globalTotals()).toEqual({ requests: 0, reserved: '0' });
  });
});
