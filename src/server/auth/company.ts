import 'server-only';
import { headers } from 'next/headers';
import { randomBytes, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { actorForCompanyMember, canManageCompanyMembers, type CompanyMembershipRecord, type CompanyModuleGrants, type CompanyRole } from '@/lib/auth/company-policy';
import { getNativeAuth } from './auth';
import { withAuthTransaction } from './database';
import { nativeAuthEnabled } from './mode';
import { blankCompanyWorkspaceState } from '@/server/data/store';
export { consumeAuthAttempt } from './rate-limit';

export type NativeUser = { id: string; name: string; email: string; twoFactorEnabled?: boolean | null };
export type NativeIdentity = { user: NativeUser; session: { id: string; activeCompanyId?: string | null } };
type MembershipRow = { id: string; tenant_id: string; user_id: string; company_role: CompanyRole; status: 'active'|'suspended'|'revoked'; modules: CompanyModuleGrants; estate_ids: string[]; all_estates: boolean; version: string; name: string; company_status: 'active'|'suspended' };
const membershipDto = (row: MembershipRow): CompanyMembershipRecord => ({ membershipId: row.id, userId: row.user_id, companyId: row.tenant_id, companyRole: row.company_role, status: row.status, companyStatus: row.company_status, modules: row.modules, estateIds: row.estate_ids, allEstates: row.all_estates });
const ALL_MODULES: CompanyModuleGrants = { estate: 'manage', facility: 'manage', shortlet: 'manage', construction: 'manage' };
const membershipSql = 'select m.*,m.version::text version,t.name,t.status company_status from company_memberships m join tenants t on t.id=m.tenant_id';

export async function getNativeIdentity(): Promise<NativeIdentity | null> {
  if (!nativeAuthEnabled()) return null;
  const requestHeaders = await headers();
  return await getNativeAuth().api.getSession({ headers: requestHeaders }) as NativeIdentity | null;
}

export async function companyPrincipalFor(identity: NativeIdentity) {
  return withAuthTransaction(identity.user.id, async (client) => {
    const selected = identity.session.activeCompanyId;
    if (selected && !/^[0-9a-f-]{36}$/i.test(selected)) return null;
    const result = await client.query<MembershipRow>(membershipSql + " where m.user_id=$1::uuid and m.status='active' and t.status='active'" + (selected ? ' and m.tenant_id=$2::uuid' : ' order by m.created_at limit 2'), selected ? [identity.user.id, selected] : [identity.user.id]);
    if (result.rows.length !== 1) return null;
    const row = result.rows[0], actor = actorForCompanyMember(membershipDto(row), identity.user.id);
    if (!actor) return null;
    return { ...identity, actor, company: { id: row.tenant_id, name: row.name }, membership: { ...membershipDto(row), version: row.version } };
  });
}
export async function getCompanyPrincipal() {
  const identity = await getNativeIdentity();
  return identity ? companyPrincipalFor(identity) : null;
}
export type CompanyPrincipal = NonNullable<Awaited<ReturnType<typeof getCompanyPrincipal>>>;

export async function recheckCompanyMembership(client: PoolClient, principal: CompanyPrincipal): Promise<void> {
  await client.query("select set_config('app.auth_user_id',$1,true)", [principal.user.id]);
  // The caller already holds the company advisory lock, shared by membership
  // management. Row-locking here would invoke UPDATE RLS and exclude members.
  const result = await client.query<MembershipRow>(membershipSql + " where m.id=$1::uuid and m.user_id=$2::uuid and m.tenant_id=$3::uuid and m.status='active' and t.status='active'", [principal.membership.membershipId, principal.user.id, principal.company.id]);
  if (result.rows.length !== 1 || result.rows[0].version !== principal.membership.version) throw new Error('Your company access changed. Refresh before continuing.');
}

export async function listCompanies(identity: NativeIdentity) {
  return withAuthTransaction(identity.user.id, async (client) => (await client.query<MembershipRow>(membershipSql + " where m.user_id=$1::uuid and m.status='active' and t.status='active' order by t.name", [identity.user.id])).rows.map((row) => ({ id: row.tenant_id, name: row.name, role: row.company_role, modules: Object.keys(row.modules) })));
}
export async function activateCompany(identity: NativeIdentity, companyId: string): Promise<void> {
  await withAuthTransaction(identity.user.id, async (client) => {
    const result = await client.query(membershipSql + " where m.user_id=$1::uuid and m.tenant_id=$2::uuid and m.status='active' and t.status='active'", [identity.user.id, companyId]);
    if (result.rowCount !== 1) throw new Error('That company is unavailable.');
    const saved = await client.query('update auth_sessions set "activeCompanyId"=$1,"updatedAt"=now() where id=$2::uuid and "userId"=$3::uuid', [companyId, identity.session.id, identity.user.id]);
    if (saved.rowCount !== 1) throw new Error('Sign in again to choose your company.');
  });
}

export async function provisionCompany(identity: NativeIdentity, name: string): Promise<string> {
  return withAuthTransaction(identity.user.id, async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,906381))', [identity.user.id]);
    const count = await client.query("select count(*)::int n from company_memberships where user_id=$1::uuid and company_role='owner' and status='active'", [identity.user.id]);
    if (count.rows[0].n >= 5) throw new Error('Your account has reached its company creation limit.');
    const id = crypto.randomUUID();
    await client.query("select set_config('app.tenant_id',$1,true)", [id]);
    await client.query('insert into tenants(id,name,country_code,data_residency,created_by_auth_user) values($1::uuid,$2,$3,$4,$5::uuid)', [id, name, 'NG', process.env.PROPBREW_DATABASE_REGION ?? 'Railway us-west2', identity.user.id]);
    await client.query("insert into company_memberships(tenant_id,user_id,company_role,modules) values($1::uuid,$2::uuid,'owner',$3::jsonb)", [id, identity.user.id, JSON.stringify(ALL_MODULES)]);
    await client.query('insert into workspace_records(tenant_id,domain_tenant_id,payload) values($1::uuid,$1::text,$2::jsonb)', [id, JSON.stringify(blankCompanyWorkspaceState())]);
    // Native tenant controls start with the same bounded provider safeguards as review.
    for (const feature of ['estate_copilot','facility_copilot','shortlet_copilot','construction_copilot']) {
      await client.query('insert into ai_feature_controls(tenant_id,feature,enabled,daily_cap_minor_ngn) values($1::uuid,$2,true,$3) on conflict(tenant_id,feature) do nothing', [id, feature, Math.min(Number(process.env.REEVE_AI_DAILY_CAP_MINOR_NGN) || 50000, 50000)]);
    }
    await client.query('update auth_sessions set "activeCompanyId"=$1,"updatedAt"=now() where id=$2::uuid and "userId"=$3::uuid', [id, identity.session.id, identity.user.id]);
    await companyAudit(client, id, identity.user.id, 'company.created', id, { modules: ALL_MODULES });
    return id;
  });
}

export async function companyAudit(client: PoolClient, companyId: string, userId: string, action: string, entityId: string, payload: unknown = {}) {
  await client.query("select set_config('app.tenant_id',$1,true)", [companyId]);
  await client.query('insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values($1::uuid,$2,$3,$4,$5,$6::jsonb)', [companyId, userId, action, 'company_membership', entityId, JSON.stringify(payload)]);
}

export async function listCompanyMembers(principal: CompanyPrincipal) {
  if (!canManageCompanyMembers(principal.actor)) return [];
  return withAuthTransaction(principal.user.id, async (client) => (await client.query('select m.id,m.user_id,u.name,u.email,m.company_role,m.modules from company_memberships m join auth_users u on u.id=m.user_id where m.tenant_id=$1::uuid and m.status<>$2 order by m.created_at', [principal.company.id, 'revoked'])).rows.map((row) => ({ id: row.id, userId: row.user_id, name: row.name, email: row.email, companyRole: row.company_role as CompanyRole, modules: row.modules as CompanyModuleGrants, isCurrentUser: row.user_id === principal.user.id })));
}

export async function withCompanyManagement<T>(principal: CompanyPrincipal, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!canManageCompanyMembers(principal.actor)) throw new Error('Only company owners and administrators can manage access.');
  return withAuthTransaction(principal.user.id, async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,812649))', [principal.company.id]);
    await recheckCompanyMembership(client, principal);
    return fn(client);
  });
}
export function newInvitationToken() { const token = randomBytes(32).toString('base64url'); return { token, hash: invitationHash(token) }; }
export function invitationHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
