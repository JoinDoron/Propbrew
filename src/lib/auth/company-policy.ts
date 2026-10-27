/**
 * Company-account grants are a ceiling over the legacy operational matrix.
 * Only a verified, active membership loaded by the server may create this DTO.
 * Neither signup fields, session metadata nor a selected workspace grant roles.
 */
import type { WorkspaceId } from '@/config/workspaces';
import { operationalProfileById, type OperationalProfileId } from '@/config/operational-profiles';
import type { Actor } from '@/lib/authz/can';
import type { Capability, Role } from '@/lib/authz/matrix';
import { ACTIONS, type Action } from '@/lib/authz/policy';

export const COMPANY_ROLES = ['owner', 'admin', 'member'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export type CompanyModuleAccess = 'manage' | 'view';
export type CompanyModuleGrants = Readonly<Partial<Record<WorkspaceId, CompanyModuleAccess>>>;
export type CompanyCapabilityGrants = Readonly<Partial<Record<Capability, CompanyModuleAccess>>>;
export type CompanyCapabilityActions = Readonly<Partial<Record<Capability, readonly Action[]>>>;
export const FACILITY_ROLES = ['manager', 'technician', 'vendor'] as const;
export type FacilityRole = (typeof FACILITY_ROLES)[number];

export type CompanyAccess = {
  readonly membershipId: string;
  readonly companyRole: CompanyRole;
  readonly modules: CompanyModuleGrants;
  readonly operationalProfileId?: OperationalProfileId;
  /** Optional deny-by-default job profile. Used by verified demo personas now
   * and by persisted operational roles when a company assigns one. */
  readonly capabilities?: CompanyCapabilityGrants;
  readonly capabilityActions?: CompanyCapabilityActions;
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
  facilityRole?: FacilityRole | null;
  vendorOrgId?: string | null;
  operationalProfileId?: OperationalProfileId | null;
  estateIds: readonly string[];
  buildingIds?: readonly string[];
  unitIds?: readonly string[];
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
  estate: ['tenant_config', 'users_roles', 'assets_ppm', 'work_orders', 'inspections_compliance', 'charges_invoicing', 'payments_in_app', 'announcements', 'bookings_amenities', 'security_sos', 'marketplace', 'reports_analytics'],
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

function validCapabilities(value: unknown): value is CompanyCapabilityGrants {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(([capability, access]) =>
    COMPANY_MODULE_CAPABILITIES.estate.includes(capability as Capability)
    && (access === 'manage' || access === 'view'));
}

function validCapabilityActions(value: unknown): value is CompanyCapabilityActions {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(([capability, actions]) =>
    COMPANY_MODULE_CAPABILITIES.estate.includes(capability as Capability)
    && Array.isArray(actions) && actions.every((action) => ACTIONS.includes(action as Action)));
}

function grantFor(modules: CompanyModuleGrants, workspace: WorkspaceId): CompanyModuleAccess | undefined {
  return Object.prototype.hasOwnProperty.call(modules, workspace) ? modules[workspace] : undefined;
}

function validAccess(actor: Actor): actor is Actor & { companyAccess: CompanyAccess } {
  const access = actor.companyAccess;
  return Boolean(access && identifier(access.membershipId) && COMPANY_ROLES.includes(access.companyRole)
    && validModules(access.modules) && validCapabilities(access.capabilities)
    && validCapabilityActions(access.capabilityActions) && identifier(actor.tenantId) && typeof actor.allEstates === 'boolean'
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
  if (record.facilityRole != null && !FACILITY_ROLES.includes(record.facilityRole)) return null;
  if (record.facilityRole === 'vendor' && !identifier(record.vendorOrgId)) return null;
  if (record.facilityRole !== 'vendor' && record.vendorOrgId != null) return null;
  const operationalProfile = record.operationalProfileId ? operationalProfileById(record.operationalProfileId) : undefined;
  if (record.operationalProfileId && !operationalProfile) return null;
  if (operationalProfile && grantFor(modules, operationalProfile.workspace) !== operationalProfile.access) return null;
  if (record.buildingIds?.some((id) => !identifier(id)) || record.unitIds?.some((id) => !identifier(id))) return null;

  const roles = new Set<Role>();
  if (operationalProfile) {
    operationalProfile.roles.forEach((role) => roles.add(role));
  } else {
    for (const workspace of MODULES) {
      const access = grantFor(modules, workspace);
      if (access === 'manage') {
        if (workspace !== 'facility') roles.add('estate_manager');
        else roles.add(record.facilityRole === 'technician' ? 'technician' : record.facilityRole === 'vendor' ? 'vendor' : 'facility_manager');
      }
      if (access === 'view') roles.add('executive');
    }
  }
  const companyAccess: CompanyAccess = Object.freeze({
    membershipId: record.membershipId,
    companyRole: record.companyRole,
    modules: Object.freeze({ ...modules }),
    ...(operationalProfile ? {
      operationalProfileId: operationalProfile.id as OperationalProfileId,
      ...(operationalProfile.capabilities ? { capabilities: operationalProfile.capabilities } : {}),
      ...(operationalProfile.capabilityActions ? { capabilityActions: operationalProfile.capabilityActions } : {}),
    } : {}),
  });
  return Object.freeze({
    userId: authenticatedUserId,
    tenantId: record.companyId,
    roles: Object.freeze([...roles]),
    estateIds: Object.freeze([...new Set(record.estateIds)]),
    buildingIds: Object.freeze([...new Set(record.buildingIds ?? [])]),
    allEstates: record.allEstates,
    unitIds: Object.freeze([...new Set(record.unitIds ?? [])]),
    vendorOrgId: operationalProfile?.scope === 'vendor' || record.facilityRole === 'vendor' ? record.vendorOrgId! : null,
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
  if (actor.companyAccess.capabilities !== undefined) {
    return actor.companyAccess.capabilities[capability] ?? 'none';
  }
  let best: CompanyModuleAccess | 'none' = 'none';
  for (const workspace of MODULES) {
    if (!COMPANY_MODULE_CAPABILITIES[workspace].includes(capability)) continue;
    const access = grantFor(actor.companyAccess.modules, workspace);
    if (access === 'manage') return 'manage';
    if (access === 'view') best = 'view';
  }
  return best;
}

/** Optional verb-level ceiling for a job profile. Absence preserves the
 * original company-module policy; presence can only narrow it. */
export function companyCapabilityActionAllowed(actor: Actor, capability: Capability, action: Action): boolean {
  if (actor.companyAccess === undefined) return true;
  if (!validAccess(actor)) return false;
  const actions = actor.companyAccess.capabilityActions?.[capability];
  return actions === undefined || actions.includes(action);
}

/** Operational users_roles grants do not grant company membership authority. */
export function canManageCompanyMembers(actor: Actor): boolean {
  return validAccess(actor) && (actor.companyAccess.companyRole === 'owner' || actor.companyAccess.companyRole === 'admin');
}
