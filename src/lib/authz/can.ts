/**
 * The decision engine. Deny-by-default (SC-01) with hard tenant isolation (§8.2:
 * "no query, file, search index, AI retrieval or report may cross tenants below
 * Platform Admin").
 *
 * `can()` returns not just a boolean but the ScopeFilter that MUST be compiled
 * into the query. Filtering after fetch is a §8.2 violation.
 */

import { CAPABILITIES, ROLES, levelFor, type Capability, type Level, type Role } from './matrix';
import { companyCapabilityAccess, companyCapabilityActionAllowed, type CompanyAccess } from '@/lib/auth/company-policy';
import {
  actionsFor,
  ESTATE_SCOPED_ROLES,
  ownershipKeysFor,
  type Action,
  type OwnershipKey,
} from './policy';

/** Session-derived. NEVER built from request body/query params. */
export type Actor = {
  userId: string;
  /** null is legal only for platform_admin. */
  tenantId: string | null;
  /** §8.1 "User + Role(s)" — plural. */
  roles: readonly Role[];
  /** Estates this user is assigned to (EstM/FacM/Sec/Tech). */
  estateIds: readonly string[];
  /** Optional block/building assignments for persisted operational profiles. */
  buildingIds?: readonly string[];
  /** true for tenant-wide roles (Executive). */
  allEstates: boolean;
  /** Units linked to a resident, incl. household (EM-02). */
  unitIds: readonly string[];
  vendorOrgId: string | null;
  investorProjectIds: readonly string[];
  /** Server-owned Construction assignments. Undefined preserves legacy actors;
   * an explicit empty list is deny-all for that dimension. */
  constructionProjectIds?: readonly string[];
  constructionPackageIds?: readonly string[];
  constructionSubcontractorIds?: readonly string[];
  constructionTaskIds?: readonly string[];
  allConstructionProjects?: boolean;
  /** Verified server-side company membership; narrows legacy matrix grants. */
  companyAccess?: CompanyAccess;
};

export type OwnershipClause =
  | { key: 'self'; userId: string }
  | { key: 'requested_by_me'; userId: string }
  | { key: 'assigned_to_me'; userId: string }
  | { key: 'my_units'; unitIds: readonly string[] }
  | { key: 'my_vendor_org'; vendorOrgId: string }
  | { key: 'my_projects'; projectIds: readonly string[] };

export type ScopeFilter = {
  /** '*' ONLY for platform_admin (§8.2). */
  tenantId: string | '*';
  estateIds: readonly string[] | 'all';
  /** Optional persisted block assignment. Rows without a block dimension pass. */
  buildingIds?: readonly string[] | 'all';
  /** Optional persisted unit assignment. Rows without a unit dimension pass. */
  unitIds?: readonly string[] | 'all';
  constructionProjectIds?: readonly string[] | 'all';
  constructionPackageIds?: readonly string[] | 'all';
  constructionSubcontractorIds?: readonly string[] | 'all';
  constructionTaskIds?: readonly string[] | 'all';
  /** null = no row-level restriction. Non-null = OR of clauses. */
  ownership: readonly OwnershipClause[] | null;
};

export type DenyReason =
  | 'unknown_capability'
  | 'unknown_action'
  | 'no_grant'
  | 'no_tenant_context'
  | 'unsatisfiable_ownership';

export type Decision =
  | { allowed: false; reason: DenyReason }
  | { allowed: true; level: Level; scope: ScopeFilter };

const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

/** Build the concrete clause for an ownership key, or null if unsatisfiable. */
function clauseFor(key: OwnershipKey, actor: Actor): OwnershipClause | null {
  switch (key) {
    case 'self':
      return { key, userId: actor.userId };
    case 'requested_by_me':
      return { key, userId: actor.userId };
    case 'assigned_to_me':
      return { key, userId: actor.userId };
    case 'my_units':
      // An empty unit list is UNSATISFIABLE, not unrestricted. Emitting an empty
      // filter here is how an O cell silently becomes an F cell.
      return actor.unitIds.length ? { key, unitIds: actor.unitIds } : null;
    case 'my_vendor_org':
      return actor.vendorOrgId ? { key, vendorOrgId: actor.vendorOrgId } : null;
    case 'my_projects':
      return actor.investorProjectIds.length ? { key, projectIds: actor.investorProjectIds } : null;
  }
}

/** Scope contributed by one role. null = this role contributes no grant. */
function scopeForRole(actor: Actor, role: Role, capability: Capability): ScopeFilter | null {
  if (role === 'platform_admin') {
    // The single cross-tenant role (§8.2). Log every such read under SC-10.
    return { tenantId: '*', estateIds: 'all', ownership: null };
  }
  if (!actor.tenantId) return null;

  const estateIds: readonly string[] | 'all' =
    ESTATE_SCOPED_ROLES.has(role) && !actor.allEstates ? actor.estateIds : 'all';

  const keys = ownershipKeysFor(role, capability);
  if (!keys) return { tenantId: actor.tenantId, estateIds, ownership: null };

  const clauses = keys.map((k) => clauseFor(k, actor)).filter((c): c is OwnershipClause => c !== null);
  if (clauses.length === 0) return null; // unsatisfiable => no grant, never "all"

  return { tenantId: actor.tenantId, estateIds, ownership: clauses };
}

/** Union of two grants — the widening rule for multi-role users. */
function widen(a: ScopeFilter, b: ScopeFilter): ScopeFilter {
  const union = (left: readonly string[] | 'all' | undefined, right: readonly string[] | 'all' | undefined) =>
    left === 'all' || right === 'all' ? 'all' as const : left === undefined ? right : right === undefined ? left : Array.from(new Set([...left, ...right]));
  return {
    tenantId: a.tenantId === '*' || b.tenantId === '*' ? '*' : a.tenantId,
    estateIds:
      a.estateIds === 'all' || b.estateIds === 'all'
        ? 'all'
        : Array.from(new Set([...a.estateIds, ...b.estateIds])),
    constructionProjectIds: union(a.constructionProjectIds, b.constructionProjectIds),
    constructionPackageIds: union(a.constructionPackageIds, b.constructionPackageIds),
    constructionSubcontractorIds: union(a.constructionSubcontractorIds, b.constructionSubcontractorIds),
    constructionTaskIds: union(a.constructionTaskIds, b.constructionTaskIds),
    // null (unrestricted) absorbs any clause list.
    ownership: a.ownership === null || b.ownership === null ? null : [...a.ownership, ...b.ownership],
  };
}

const LEVEL_DISPLAY_RANK: Record<Level, number> = { F: 4, M: 3, V: 2, O: 1, none: 0 };

/**
 * Deny-by-default. Every early return is a denial; the only path to `allowed` is
 * an explicit matrix grant plus a satisfiable scope.
 *
 * Multi-role semantics are UNION, not ranking — see the design notes. `level` on
 * the result is for UI display only (which affordances to render); never branch
 * on it for authorisation.
 */
export function can(actor: Actor, capability: Capability, action: Action): Decision {
  if (!(CAPABILITIES as readonly string[]).includes(capability)) return deny('unknown_capability');
  const companyAccess = companyCapabilityAccess(actor, capability);
  if (companyAccess === 'none' || companyAccess !== null && (action === 'configure'
    || companyAccess === 'view' && action !== 'read' && action !== 'export')
    || !companyCapabilityActionAllowed(actor, capability, action)) return deny('no_grant');

  let result: Decision = deny('no_grant');

  for (const role of actor.roles) {
    if (!(ROLES as readonly string[]).includes(role)) continue; // unknown role => ignored
    if (!actionsFor(role, capability).includes(action)) continue; // not granted by §7
    const scope = scopeForRole(actor, role, capability);
    if (!scope) continue; // no tenant / unsatisfiable

    const level = levelFor(role, capability);
    result = result.allowed
      ? {
          allowed: true,
          level: LEVEL_DISPLAY_RANK[level] > LEVEL_DISPLAY_RANK[result.level] ? level : result.level,
          scope: widen(result.scope, scope),
        }
      : { allowed: true, level, scope };
  }

  if (!result.allowed && !actor.tenantId && !actor.roles.includes('platform_admin')) {
    return deny('no_tenant_context');
  }
  if (result.allowed && companyAccess !== null) {
    // Executive is the legacy viewer role, but company viewers must retain
    // their explicit assignments instead of executive's tenant-wide scope.
    const estateIds = actor.allEstates ? result.scope.estateIds
      : result.scope.estateIds === 'all' ? actor.estateIds
        : result.scope.estateIds.filter((id) => actor.estateIds.includes(id));
    const buildingIds = actor.buildingIds?.length ? actor.buildingIds : 'all';
    const unitIds = actor.unitIds.length ? actor.unitIds : 'all';
    const constructionProjectIds = actor.allConstructionProjects ? 'all' : actor.constructionProjectIds;
    return { ...result, level: companyAccess === 'view' ? 'V' : result.level === 'F' ? 'M' : result.level,
      scope: { ...result.scope, estateIds, buildingIds, unitIds,
        ...(constructionProjectIds !== undefined ? { constructionProjectIds } : {}),
        ...(actor.constructionPackageIds !== undefined ? { constructionPackageIds: actor.constructionPackageIds } : {}),
        ...(actor.constructionSubcontractorIds !== undefined ? { constructionSubcontractorIds: actor.constructionSubcontractorIds } : {}),
        ...(actor.constructionTaskIds !== undefined ? { constructionTaskIds: actor.constructionTaskIds } : {}),
      } };
  }
  return result;
}

export class ForbiddenError extends Error {
  constructor(
    readonly capability: Capability,
    readonly action: Action,
    readonly reason: DenyReason,
  ) {
    // Deliberately opaque. A descriptive message lets any authenticated user
    // enumerate capabilities and tenants.
    super('Not found');
    this.name = 'ForbiddenError';
  }
}

/** Throwing form for API handlers and server actions. Returns the ScopeFilter. */
export function assertCan(actor: Actor, capability: Capability, action: Action): ScopeFilter {
  const decision = can(actor, capability, action);
  if (!decision.allowed) throw new ForbiddenError(capability, action, decision.reason);
  return decision.scope;
}

/** Highest level held on a capability — for UI affordance shaping ONLY. */
export function effectiveLevel(actor: Actor, capability: Capability): Level {
  const companyAccess = companyCapabilityAccess(actor, capability);
  if (companyAccess === 'none') return 'none';
  let best: Level = 'none';
  for (const role of actor.roles) {
    if (!(ROLES as readonly string[]).includes(role)) continue;
    const level = levelFor(role, capability);
    if (LEVEL_DISPLAY_RANK[level] > LEVEL_DISPLAY_RANK[best]) best = level;
  }
  if (companyAccess === 'view' && best !== 'none') return 'V';
  if (companyAccess !== null && best === 'F') return 'M';
  return best;
}

/** Cross-tenant guard for any record loaded by id (§8.2). */
export function assertSameTenant(scope: ScopeFilter, recordTenantId: string): void {
  if (scope.tenantId === '*') return;
  if (scope.tenantId !== recordTenantId) throw new Error('Not found');
}
