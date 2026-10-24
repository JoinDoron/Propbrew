/**
 * Company-account grants are a ceiling over the legacy operational matrix.
 * Only a verified, active membership loaded by the server may create this DTO.
 * Neither signup fields, session metadata nor a selected workspace grant roles.
 */
import type { WorkspaceId } from '@/config/workspaces';
import type { Actor } from '@/lib/authz/can';
import type { Capability, Role } from '@/lib/authz/matrix';
import { ACTIONS, type Action } from '@/lib/authz/policy';

export const COMPANY_ROLES = ['owner', 'admin', 'member'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export type CompanyModuleAccess = 'manage' | 'view';
export type CompanyModuleGrants = Readonly<Partial<Record<WorkspaceId, CompanyModuleAccess>>>;

export type CompanyAccess = {
  readonly membershipId: string;
  readonly companyRole: CompanyRole;
  readonly modules: CompanyModuleGrants;
};

/** A database membership joined to its company, never a request payload. */
export type CompanyMembershipRecord = {
  membershipId: string;
  userId: string;
  companyId: string;
  status: 'active' | 'invited' | 'suspended' | 'revoked';
  companyStatus: 'active' | 'suspended';
  companyRole: CompanyRole;
  /** Owners/admins default to all four modules when this is absent. */
  modules?: CompanyModuleGrants;
  estateIds: readonly string[];
  allEstates: boolean;
};

const MODULES: readonly WorkspaceId[] = ['estate', 'facility', 'shortlet', 'construction'];
const READ_ACTIONS: readonly Action[] = ['read', 'export'];
const ALL_MODULES: CompanyModuleGrants = Object.freeze({
  estate: 'manage', facility: 'manage', shortlet: 'manage', construction: 'manage',
});

/**
 * These capability groups narrow the existing matrix; they never add grants.
 * A capability shared by two modules still needs an explicit module guard at
 * the page/API/action boundary, especially for mixed manager/viewer accounts.
 */
export const COMPANY_MODULE_CAPABILITIES: Readonly<Record<WorkspaceId, readonly Capability[]>> = {
  estate: ['tenant_config', 'users_roles', 'assets_ppm', 'work_orders', 'inspections_compliance', 'charges_invoicing', 'announcements', 'bookings_amenities', 'security_sos', 'marketplace', 'reports_analytics'],
  facility: ['users_roles', 'assets_ppm', 'work_orders', 'inspections_compliance', 'announcements', 'reports_analytics'],
  shortlet: ['users_roles', 'bookings_amenities', 'reports_analytics'],
  construction: ['users_roles', 'reports_analytics'],
};

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
    && value !== '*' && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function validModules(value: unknown): value is CompanyModuleGrants {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(([workspace, access]) => MODULES.includes(workspace as WorkspaceId)
    && (access === 'manage' || access === 'view'));
}

function grantFor(modules: CompanyModuleGrants, workspace: WorkspaceId): CompanyModuleAccess | undefined {
  return Object.prototype.hasOwnProperty.call(modules, workspace) ? modules[workspace] : undefined;
}

function validAccess(actor: Actor): actor is Actor & { companyAccess: CompanyAccess } {
  const access = actor.companyAccess;
  return Boolean(access && identifier(access.membershipId) && COMPANY_ROLES.includes(access.companyRole)
    && validModules(access.modules) && identifier(actor.tenantId) && typeof actor.allEstates === 'boolean'
    && Array.isArray(actor.estateIds) && actor.estateIds.every(identifier)
    && !actor.roles.includes('platform_admin'));
}

/**
 * Bind the membership to the authenticated account before projecting roles.
 * Return null on stale/malformed records; never fall back to demo identities.
 */
export function actorForCompanyMember(record: CompanyMembershipRecord, authenticatedUserId: string): Actor | null {
  if (!record || !identifier(authenticatedUserId) || record.userId !== authenticatedUserId
    || !identifier(record.membershipId) || !identifier(record.companyId)
    || record.status !== 'active' || record.companyStatus !== 'active'
    || !COMPANY_ROLES.includes(record.companyRole) || typeof record.allEstates !== 'boolean'
    || !Array.isArray(record.estateIds) || record.estateIds.some((id) => !identifier(id))) return null;
  const modules = record.modules ?? (record.companyRole === 'member' ? {} : ALL_MODULES);
  if (!validModules(modules)) return null;

  const roles = new Set<Role>();
  for (const workspace of MODULES) {
    const access = grantFor(modules, workspace);
    if (access === 'manage') roles.add(workspace === 'facility' ? 'facility_manager' : 'estate_manager');
    if (access === 'view') roles.add('executive');
  }
  const companyAccess: CompanyAccess = Object.freeze({
    membershipId: record.membershipId,
    companyRole: record.companyRole,
    modules: Object.freeze({ ...modules }),
  });
  return Object.freeze({
    userId: authenticatedUserId,
    tenantId: record.companyId,
    roles: Object.freeze([...roles]),
    estateIds: Object.freeze([...new Set(record.estateIds)]),
    allEstates: record.allEstates,
    unitIds: Object.freeze([]),
    vendorOrgId: null,
    investorProjectIds: Object.freeze([]),
    companyAccess,
  });
}

/**
 * A narrowing guard: legacy actors still require their existing matrix checks.
 * Call for the actual server-owned module and verb on every action/API. A
 * browser-selected workspace or the capability union cannot replace this.
 */
export function canUseCompanyModule(actor: Actor, module: unknown, action: Action): boolean {
  if (!MODULES.includes(module as WorkspaceId) || !ACTIONS.includes(action)) return false;
  if (actor.companyAccess === undefined) return true;
  if (!validAccess(actor) || action === 'configure') return false;
  const access = grantFor(actor.companyAccess.modules, module as WorkspaceId);
  return access === 'manage' || access === 'view' && READ_ACTIONS.includes(action);
}

/** null means no additional ceiling for a legacy identity. */
export function companyCapabilityAccess(actor: Actor, capability: Capability): CompanyModuleAccess | 'none' | null {
  if (actor.companyAccess === undefined) return null;
  if (!validAccess(actor)) return 'none';
  let best: CompanyModuleAccess | 'none' = 'none';
  for (const workspace of MODULES) {
    if (!COMPANY_MODULE_CAPABILITIES[workspace].includes(capability)) continue;
    const access = grantFor(actor.companyAccess.modules, workspace);
    if (access === 'manage') return 'manage';
    if (access === 'view') best = 'view';
  }
  return best;
}

/** Operational users_roles grants do not grant company membership authority. */
export function canManageCompanyMembers(actor: Actor): boolean {
  return validAccess(actor) && (actor.companyAccess.companyRole === 'owner' || actor.companyAccess.companyRole === 'admin');
}
