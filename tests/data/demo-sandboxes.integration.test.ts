import { randomUUID } from 'node:crypto';
import { Client, type Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../../scripts/migrate.mjs';
import { DEMO_ACCOUNTS, DEMO_TENANT_ID } from '@/server/auth/demo-accounts.mjs';
import { ensureDemoSandbox, findDemoSandbox, resetDemoSandboxFor, type DemoSandbox } from '@/server/auth/demo-sandbox';
import { withAuthTransaction } from '@/server/auth/database';
import { withWorkspaceState } from '@/server/data/workspace-postgres';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { withTenant } from '@/server/db';
import type { CompanyPrincipal } from '@/server/auth/company';

const testUrl = process.env.PROPBREW_TEST_DATABASE_URL;
if (testUrl && !['localhost','127.0.0.1','[::1]'].includes(new URL(testUrl).hostname)) throw new Error('Demo sandbox tests require a disposable loopback database.');
const account = DEMO_ACCOUNTS[1];
const sessionA = randomUUID(), sessionB = randomUUID(), sessionOther = randomUUID();
const userOther = randomUUID(), tenantOther = randomUUID();
const identityA = { user: { id: account.userId }, session: { id: sessionA } };
const identityB = { user: { id: account.userId }, session: { id: sessionB } };
const personal = { user: { id: userOther }, session: { id: sessionOther } };
let admin: Client;
let a: DemoSandbox, b: DemoSandbox;
let customerBefore: unknown;

async function scoped<T>(identity: typeof identityA, tenant: string, fn: (client: PoolClient) => Promise<T>) {
  return withAuthTransaction(identity.user.id, async (client) => {
    await client.query("select set_config('app.tenant_id',$1,true)", [tenant]);
    return fn(client);
  }, identity.session.id);
}
const snapshot = async (tenant: string) => (await admin.query('select version::text,payload from workspace_records where tenant_id=$1::uuid',[tenant])).rows[0];

describe.skipIf(!testUrl)('private editable demo sandboxes with real restricted PostgreSQL', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: testUrl }); await admin.connect();
    await admin.query("do $$ begin if not exists(select from pg_roles where rolname='propbrew_review_app') then create role propbrew_review_app login nosuperuser nocreatedb nocreaterole nobypassrls; end if; end $$");
    await runMigrations({ url: testUrl });
    await admin.query('grant usage on schema public to propbrew_review_app');
    const url = new URL(testUrl!); url.username='propbrew_review_app';
    vi.stubEnv('DATABASE_URL',url.toString()); vi.stubEnv('DATA_SOURCE','postgres');
    vi.stubEnv('PROPBREW_AUTH_MODE','company'); vi.stubEnv('PROPBREW_DEMO_ACCOUNTS','1');
    vi.stubEnv('PROPBREW_DEMO_PASSWORD','disposable-private-sandbox-password-over-thirty-two');
    await admin.query('insert into auth_users(id,name,email,"createdAt","updatedAt") values($1,$2,$3,now(),now()) on conflict(id) do nothing',[account.userId,account.name,account.email]);
    await admin.query('insert into auth_users(id,name,email,"createdAt","updatedAt") values($1,$2,$3,now(),now())',[userOther,'Private customer fixture',`${userOther}@example.invalid`]);
    for (const [id,user] of [[sessionA,account.userId],[sessionB,account.userId],[sessionOther,userOther]]) {
      await admin.query('insert into auth_sessions(id,"token","userId","expiresAt","createdAt","updatedAt") values($1,$2,$3,now()+interval \'24 hours\',now(),now())',[id,randomUUID(),user]);
    }
    await admin.query('insert into tenants(id,name,created_by_auth_user) values($1,$2,$3)',[tenantOther,'Real-company boundary fixture',userOther]);
    await admin.query("insert into company_memberships(tenant_id,user_id,company_role,modules) values($1,$2,'owner','{\"estate\":\"manage\"}'::jsonb)",[tenantOther,userOther]);
    await admin.query('insert into workspace_records(tenant_id,domain_tenant_id,payload) values($1::uuid,($1::uuid)::text,$2::jsonb)',[tenantOther,JSON.stringify(createDemoWorkspaceState(tenantOther))]);
    customerBefore = await snapshot(tenantOther);
    a=await ensureDemoSandbox(identityA); b=await ensureDemoSandbox(identityB);
  },30_000);

  afterAll(async () => {
    if (admin && a && b) {
      const ids=[a.id,b.id,tenantOther];
      await admin.query('delete from ai_company_budget_reservations where tenant_id=any($1::uuid[])',[ids]);
      await admin.query('delete from ai_copilot_usage where tenant_id=any($1::uuid[])',[ids]);
    }
    const globals=globalThis as typeof globalThis & { __propbrewAuthPool?: {pool:Pool}; __propbrewPgPool?:{pool:Pool} };
    await globals.__propbrewAuthPool?.pool.end(); await globals.__propbrewPgPool?.pool.end();
    delete globals.__propbrewAuthPool; delete globals.__propbrewPgPool;
    vi.unstubAllEnvs(); await admin?.end();
  });

  it('allocates independent populated companies for two visitors using the same demo login', async () => {
    expect(a.id).not.toBe(b.id); expect(a.id).not.toBe(DEMO_TENANT_ID);
    expect(await ensureDemoSandbox(identityA)).toEqual(a);
    expect(await findDemoSandbox(identityB)).toEqual(b);
    for (const sandbox of [a,b]) {
      const state=(await snapshot(sandbox.id)).payload as WorkspaceRecordState;
      for(const name of ['sites','residents','workOrders','shortletBookings','constructionProjects']) expect((state.collections[name] as unknown[]).length).toBeGreaterThan(0);
      expect(JSON.stringify(state)).not.toContain(DEMO_TENANT_ID);
      expect(state.auxiliary['shortlet:settings']).toMatchObject({[`tenant:${sandbox.id}`]:{planKey:'enterprise'}});
      expect(state.collections.users).toEqual(expect.arrayContaining([expect.objectContaining({id:account.userId,name:'Demo operator',tenantId:sandbox.id,roles:expect.arrayContaining(['technician','security'])})]));
    }
  });

  it('enforces per-session RLS on companies, memberships and workspace reads and writes', async () => {
    const visible=await scoped(identityA,a.id,async client=>({
      tenants:(await client.query('select id from tenants')).rows,
      memberships:(await client.query('select tenant_id from company_memberships')).rows,
      workspaces:(await client.query('select tenant_id from workspace_records')).rows,
    }));
    expect(visible).toEqual({tenants:[{id:a.id}],memberships:[{tenant_id:a.id}],workspaces:[{tenant_id:a.id}]});
    for(const target of [b.id,tenantOther]){
      expect(await scoped(identityA,target,async client=>(await client.query('select tenant_id from workspace_records')).rows)).toEqual([]);
      expect(await scoped(identityA,target,async client=>(await client.query("update workspace_records set version=version+1 where tenant_id=$1::uuid",[target])).rowCount)).toBe(0);
    }
    expect(await scoped(personal,a.id,async client=>(await client.query('select tenant_id from workspace_records')).rows)).toEqual([]);
    expect(await snapshot(tenantOther)).toEqual(customerBefore);
  });

  it('persists edits and reset only in the current sandbox, retaining the other visitor and customer records', async () => {
    const beforeB=await snapshot(b.id);
    await scoped(identityA,a.id,async client=>{await client.query("update workspace_records set payload=jsonb_set(payload,'{auxiliary,ownTest}',to_jsonb('saved example'::text)),version=version+1 where tenant_id=$1",[a.id]);});
    expect((await snapshot(a.id)).payload.auxiliary.ownTest).toBe('saved example');
    const globals=globalThis as typeof globalThis & { __propbrewAuthPool?: {pool:Pool} };
    await globals.__propbrewAuthPool?.pool.end(); delete globals.__propbrewAuthPool;
    expect(await ensureDemoSandbox(identityA)).toEqual(a);
    expect((await snapshot(a.id)).payload.auxiliary.ownTest).toBe('saved example');
    await resetDemoSandboxFor(identityA);
    expect((await snapshot(a.id)).payload.auxiliary.ownTest).toBeUndefined();
    expect(await snapshot(b.id)).toEqual(beforeB); expect(await snapshot(tenantOther)).toEqual(customerBefore);
  });

  it('authorizes a workspace session before payload hydration and rejects forged foreign context', async () => {
    const authorize=(identity:typeof identityA)=>(client:PoolClient)=>client.query("select set_config('app.auth_user_id',$1,true),set_config('app.auth_session_id',$2,true)",[identity.user.id,identity.session.id]).then(()=>{});
    const own=await withWorkspaceState(a.id,a.id,'read',()=>{throw new Error('No reseed');},async state=>({value:state}),authorize(identityA));
    expect((own as WorkspaceRecordState).auxiliary.demoFixture).toMatchObject({tenantId:a.id});
    await expect(withWorkspaceState(b.id,b.id,'read',()=>{throw new Error('Foreign workspace denied');},async state=>({value:state}),authorize(identityA))).rejects.toThrow('Foreign workspace denied');
  });

  it('uses the database reset time rather than a supplied offline replay boundary', async () => {
    const beforeB=await snapshot(b.id);
    const state=createDemoWorkspaceState(a.id,account.userId);
    const forgedBoundary='2999-12-31T23:59:59.999Z';
    state.auxiliary.demoResetAt=forgedBoundary;
    const before=(await admin.query('select clock_timestamp() as sampled_at')).rows[0].sampled_at as Date;
    await scoped(identityA,a.id,async client=>{await client.query('select reset_demo_sandbox($1::jsonb)',[JSON.stringify(state)]);});
    const after=(await admin.query('select clock_timestamp() as sampled_at')).rows[0].sampled_at as Date;
    const stamp=(await snapshot(a.id)).payload.auxiliary.demoResetAt as string;
    expect(stamp).not.toBe(forgedBoundary);
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(stamp)).toBeGreaterThanOrEqual(before.getTime());
    expect(Date.parse(stamp)).toBeLessThanOrEqual(after.getTime());
    const registry=(await admin.query('select last_reset_at from demo_sandboxes where tenant_id=$1',[a.id])).rows[0];
    expect(registry.last_reset_at.toISOString()).toBe(stamp);
    const audit=(await admin.query("select payload from audit_events where tenant_id=$1 and action='demo.sandbox.reset' order by created_at desc limit 1",[a.id])).rows[0];
    expect(audit.payload).toEqual({source:'repository-fixtures',resetAt:stamp});
    expect(await snapshot(b.id)).toEqual(beforeB); expect(await snapshot(tenantOther)).toEqual(customerBefore);
  });

  it('propagates the verified principal to operational and AI statement transactions', async () => {
    const principal={...identityA,company:{id:a.id},actor:{userId:account.userId}} as CompanyPrincipal;
    const state=(await snapshot(a.id)).payload as WorkspaceRecordState;
    const rows=await runWithRecordContext({state,domainTenantId:a.id,mode:'read',companyPrincipal:principal},()=>withTenant(a.id,q=>q`select tenant_id from ai_feature_controls`));
    expect(rows).toHaveLength(4);
    const foreign=await runWithRecordContext({state,domainTenantId:a.id,mode:'read',companyPrincipal:principal},()=>withTenant(b.id,q=>q`select tenant_id from ai_feature_controls`));
    expect(foreign).toEqual([]);
  });

  it('limits all public demo sessions to a shared AI pool that reset cannot replenish', async () => {
    const reserve=(identity:typeof identityA,tenant:string,cost:number,feature:string)=>scoped(identity,tenant,async client=>(await client.query('select * from reserve_company_copilot_budget($1,$2,$3,$4,$5,$6,null,null)',[tenant,randomUUID(),identity.user.id,feature,'test-model',cost])).rows[0]);
    expect(await reserve(identityA,a.id,40000,'estate_copilot')).toEqual({allowed:true,reason:null});
    expect(await reserve(identityB,b.id,40000,'facility_copilot')).toEqual({allowed:true,reason:null});
    expect(await reserve(identityA,a.id,25000,'shortlet_copilot')).toEqual({allowed:false,reason:'demo_daily_budget_exceeded'});
    await resetDemoSandboxFor(identityA);
    expect(await reserve(identityA,a.id,25000,'shortlet_copilot')).toEqual({allowed:false,reason:'demo_daily_budget_exceeded'});
    expect(await reserve(personal,tenantOther,25000,'estate_copilot')).toEqual({allowed:true,reason:null});
    await expect(reserve(identityA,b.id,1,'estate_copilot')).rejects.toThrow('Demo session context mismatch');
  });

  it('fails closed on expired and signed-out sessions while preserving saved sandbox records', async () => {
    await admin.query('update auth_sessions set "expiresAt"=now()-interval \'1 minute\' where id=$1',[sessionB]);
    expect(await findDemoSandbox(identityB)).toBeNull();
    await expect(ensureDemoSandbox(identityB)).rejects.toThrow('unavailable');
    expect(await scoped(identityB,b.id,async client=>(await client.query('select tenant_id from workspace_records')).rows)).toEqual([]);
    await admin.query('delete from auth_sessions where id=$1',[sessionB]);
    expect((await admin.query('select auth_session_id from demo_sandboxes where tenant_id=$1',[b.id])).rows[0].auth_session_id).toBeNull();
    expect(await snapshot(b.id)).toBeDefined();
    expect(await snapshot(tenantOther)).toEqual(customerBefore);
  });
});
