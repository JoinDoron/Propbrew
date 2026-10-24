import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { DEMO_ACCOUNTS, DEMO_COMPANY_NAME, DEMO_MODULE_GRANTS, DEMO_TENANT_ID } from '../src/server/auth/demo-accounts.mjs';
import { postgresConfig } from '../src/server/postgres-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function writeState(path) {
  // Vite is used only by the development-time exporter. Deployed provisioning
  // reads the exported JSON and uses ordinary Node, pg and Better Auth crypto.
  const { createServer } = await import('vite');
  const server = await createServer({ root, configFile: false, envDir: false, server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias: { '@': resolve(root, 'src'), 'server-only': resolve(root, 'tests/server-only-stub.ts') } },
  });
  try {
    const { createDemoWorkspaceState } = await server.ssrLoadModule('/src/server/data/demo-state.ts');
    const state = createDemoWorkspaceState();
    await writeFile(resolve(path), JSON.stringify(state), { mode: 0o600 });
    console.log(JSON.stringify({ demoStateWritten: true, collections: Object.keys(state.collections).length }));
  } finally { await server.close(); }
}

function validateState(state) {
  if (state?.schemaVersion !== 1 || !state.collections || !state.history || !state.auxiliary || !state.sequences
    || state.auxiliary.demoFixture?.source !== 'repository-fixtures'
    || state.auxiliary.demoFixture?.tenantId !== DEMO_TENANT_ID
    || Object.keys(state.history).length || Object.keys(state.sequences).length) throw new Error('Use the source-only demo fixture exporter.');
  if (JSON.stringify(state).length > 8_000_000) throw new Error('Demo fixture exceeds its allowed size.');
  function inspect(value) {
    if (Array.isArray(value)) { for (const row of value) inspect(row); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'tenantId' && entry !== DEMO_TENANT_ID) throw new Error('A foreign tenant entered the demo fixture.');
      inspect(entry);
    }
  }
  inspect(state);
  for (const name of ['sites', 'residents', 'assets', 'vendors', 'investorProjects', 'shortletProperties', 'constructionProjects']) {
    if (!Array.isArray(state.collections[name]) || state.collections[name].length === 0) throw new Error('Demo fixture is incomplete.');
  }
  if (state.collections.shortletBookingPage?.enabled !== false) throw new Error('Public booking must remain disabled.');
}

async function provisioningSql(state) {
  const password = process.env.PROPBREW_DEMO_PASSWORD;
  if (process.env.PROPBREW_DEMO_ACCOUNTS !== '1' || !password || password.length < 32 || password.length > 128) throw new Error('Explicit demo enablement and a server-only random demo password are required.');
  const hashed = await hashPassword(password);
  const users = DEMO_ACCOUNTS.map(({ userId, email, name }) => ({ userId, email, name }));
  const statements = [
    'begin;',
    "select pg_advisory_xact_lock(hashtextextended('propbrew:public-demo-provisioning',0));",
    `do $demo_guard$ begin
      if not exists(select from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then raise exception 'An administrator connection is required for demo provisioning'; end if;
      if exists(select from tenants where (id=${quote(DEMO_TENANT_ID)}::uuid or name=${quote(DEMO_COMPANY_NAME)}) and (id is distinct from ${quote(DEMO_TENANT_ID)}::uuid or name is distinct from ${quote(DEMO_COMPANY_NAME)} or created_by_auth_user is distinct from ${quote(users[0].userId)}::uuid)) then raise exception 'Reserved demo company identity is already in use'; end if;
      if exists(select from workspace_records where tenant_id=${quote(DEMO_TENANT_ID)}::uuid and (domain_tenant_id<>${quote(DEMO_TENANT_ID)} or payload->'auxiliary'->'demoFixture'->>'source' is distinct from 'repository-fixtures')) then raise exception 'Existing demo workspace does not match its source marker'; end if;
    end $demo_guard$;`,
  ];
  for (const user of users) {
    statements.push(`do $demo_guard$ begin
      if exists(select from auth_users where (id=${quote(user.userId)}::uuid or lower(email)=${quote(user.email)}) and not(id=${quote(user.userId)}::uuid and email=${quote(user.email)} and name=${quote(user.name)} and not coalesce("twoFactorEnabled",false))) then raise exception 'Reserved demo account identity is already in use'; end if;
      if exists(select from auth_accounts where ("userId"=${quote(user.userId)}::uuid and ("providerId"<>'credential' or "accountId"<>${quote(user.userId)})) or ("providerId"='credential' and "accountId"=${quote(user.userId)} and "userId"<>${quote(user.userId)}::uuid)) then raise exception 'Demo account has an unexpected provider'; end if;
      if exists(select from company_memberships where user_id=${quote(user.userId)}::uuid and tenant_id<>${quote(DEMO_TENANT_ID)}::uuid) then raise exception 'Demo identity is linked to another company'; end if;
    end $demo_guard$;`);
    statements.push(`insert into auth_users(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") values(${quote(user.userId)}::uuid,${quote(user.name)},${quote(user.email)},false,now(),now(),false) on conflict(id) do nothing;`);
    statements.push(`insert into auth_accounts("accountId","providerId","userId",password,"createdAt","updatedAt") values(${quote(user.userId)},'credential',${quote(user.userId)}::uuid,${quote(hashed)},now(),now()) on conflict("providerId","accountId") do update set password=excluded.password,"updatedAt"=now() where auth_accounts."userId"=excluded."userId";`);
  }
  statements.push(`insert into tenants(id,name,country_code,data_residency,created_by_auth_user) values(${quote(DEMO_TENANT_ID)}::uuid,${quote(DEMO_COMPANY_NAME)},'NG',${quote(process.env.PROPBREW_DATABASE_REGION || 'Railway us-west2')},${quote(users[0].userId)}::uuid) on conflict(id) do nothing;`);
  for (const user of users) {
    statements.push(`insert into company_memberships(tenant_id,user_id,company_role,status,modules,all_estates) values(${quote(DEMO_TENANT_ID)}::uuid,${quote(user.userId)}::uuid,'member','active',${quote(JSON.stringify(DEMO_MODULE_GRANTS))}::jsonb,true) on conflict(tenant_id,user_id) do update set company_role='member',modules=excluded.modules,all_estates=true,estate_ids='[]'::jsonb,version=company_memberships.version+1,updated_at=now();`);
  }
  statements.push(`insert into workspace_records(tenant_id,domain_tenant_id,payload) values(${quote(DEMO_TENANT_ID)}::uuid,${quote(DEMO_TENANT_ID)},${quote(JSON.stringify(state))}::jsonb) on conflict(tenant_id) do nothing;`);
  for (const feature of ['estate_copilot', 'facility_copilot', 'shortlet_copilot', 'construction_copilot']) {
    // Keep the public sample within the bounded per-feature company cap. Never
    // overwrite an operator's disabled feature or previously lowered budget.
    statements.push(`insert into ai_feature_controls(tenant_id,feature,enabled,daily_cap_minor_ngn) values(${quote(DEMO_TENANT_ID)}::uuid,${quote(feature)},true,50000) on conflict(tenant_id,feature) do nothing;`);
  }
  statements.push(`insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values(${quote(DEMO_TENANT_ID)}::uuid,'propbrew-demo-provisioner','demo.accounts.ensured','demo_workspace',${quote(DEMO_TENANT_ID)},'{"source":"repository-fixtures","accounts":4,"access":"view"}'::jsonb);`);
  statements.push('commit;');
  return statements.join('\n');
}

async function main() {
  const exportPath = option('--write-state');
  if (exportPath) { await writeState(exportPath); return; }
  if (!args.includes('--confirm-demo-seed') || !option('--state-file')) throw new Error('Use --confirm-demo-seed --state-file <source-export.json>.');
  const state = JSON.parse(await readFile(resolve(option('--state-file')), 'utf8'));
  validateState(state);
  const sql = await provisioningSql(state);
  const sqlPath = option('--write-sql');
  if (sqlPath) {
    await writeFile(resolve(sqlPath), sql, { mode: 0o600 });
    console.log(JSON.stringify({ demoProvisioningSqlWritten: true, accounts: DEMO_ACCOUNTS.length, containsPlaintextPassword: false }));
    return;
  }
  const databaseVariable = option('--database-env');
  if (!databaseVariable || !/^[A-Z][A-Z0-9_]*$/.test(databaseVariable) || !process.env[databaseVariable]) throw new Error('Choose the explicit administrator connection with --database-env <ENV_NAME>.');
  const client = new Client(postgresConfig(process.env[databaseVariable]));
  await client.connect();
  try { await client.query(sql); console.log(JSON.stringify({ demoAccountsEnsured: DEMO_ACCOUNTS.length, tenant: 'isolated-source-demo', existingWorkspacePreserved: true })); }
  catch { await client.query('rollback'); throw new Error('Demo provisioning failed. No credentials or records were printed.'); }
  finally { await client.end(); }
}

main().catch(() => { console.error('Demo setup did not complete. Check its explicit flags, source fixture and administrator connection. No credentials were printed.'); process.exitCode = 1; });
