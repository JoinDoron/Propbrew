/**
 * Compiling a ScopeFilter into a query, two ways.
 *
 * `toWhere` produces the Prisma-shaped `where` the real backend will run.
 * `applyScope` is its in-memory twin — the seed adapter applies the SAME filter
 * a laptop that the SQL adapter applies in the database, so a scope bug is
 * reproducible today without a database and the conformance tests transfer
 * unchanged to the HTTP adapter.
 *
 * §8.2 forbids post-fetch filtering for search indexes and AI retrieval because
 * the leak happens before any application filter runs; applying scope inside the
 * adapter keeps the web app honest about that boundary.
 */

import type { OwnershipClause, ScopeFilter } from './can';
import type { OwnershipKey } from './policy';

const OWNERSHIP_COLUMN: Record<OwnershipKey, string> = {
  self: 'ownerUserId',
  requested_by_me: 'requesterUserId',
  assigned_to_me: 'assigneeUserId',
  my_units: 'unitId',
  my_vendor_org: 'vendorOrgId',
  my_projects: 'projectId',
};

function clauseToWhere(c: OwnershipClause): Record<string, unknown> {
  switch (c.key) {
    case 'self':
    case 'requested_by_me':
    case 'assigned_to_me':
      return { [OWNERSHIP_COLUMN[c.key]]: c.userId };
    case 'my_units':
      return { unitId: { in: c.unitIds } };
    case 'my_vendor_org':
      return { vendorOrgId: c.vendorOrgId };
    case 'my_projects':
      return { projectId: { in: c.projectIds } };
  }
}

/**
 * Prisma-shaped `where`. Never emits an empty `OR` — in Prisma `OR: []` means
 * MATCH EVERYTHING, which would turn an O grant into an F grant.
 */
export function toWhere(scope: ScopeFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (scope.tenantId !== '*') where.tenantId = scope.tenantId;

  if (scope.estateIds !== 'all') {
    // MUST mirror `matchesScope` exactly, including its NULL rule: a row's
    // estate is `estateId ?? siteId`, and a row with NO estate dimension is not
    // estate-scoped, so it passes.
    //
    // A bare `estateId: { in: [...] }` does NOT express that — SQL/Prisma `IN`
    // excludes NULL — so every estate-less row would vanish the day this filter
    // starts hitting a real database. Construction and Short-Let rows are
    // exactly that case by design (they span the portfolio), so the two largest
    // modules would silently return nothing.
    const inEstates = { in: scope.estateIds };
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      {
        OR: [
          { estateId: inEstates },
          { AND: [{ estateId: null }, { siteId: inEstates }] },
          { AND: [{ estateId: null }, { siteId: null }] },
        ],
      },
    ];
  }

  if (scope.buildingIds && scope.buildingIds !== 'all') {
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      { OR: [{ buildingId: { in: scope.buildingIds } }, { buildingId: null }] },
    ];
  }

  if (scope.unitIds && scope.unitIds !== 'all') {
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      { OR: [{ unitId: { in: scope.unitIds } }, { unitId: null }] },
    ];
  }

  if (scope.ownership) {
    if (scope.ownership.length === 0) {
      throw new Error('empty ownership clause — refusing to build a match-everything filter');
    }
    where.OR = scope.ownership.map(clauseToWhere);
  }
  return where;
}

/** The columns a row may expose for ownership matching. All optional. */
export type ScopableRow = {
  tenantId?: string;
  siteId?: string;
  estateId?: string;
  buildingId?: string;
  ownerUserId?: string;
  requesterUserId?: string;
  assigneeUserId?: string;
  unitId?: string;
  vendorOrgId?: string;
  projectId?: string;
};

function clauseMatches(row: ScopableRow, c: OwnershipClause): boolean {
  switch (c.key) {
    case 'self':
      return row.ownerUserId === c.userId;
    case 'requested_by_me':
      return row.requesterUserId === c.userId;
    case 'assigned_to_me':
      return row.assigneeUserId === c.userId;
    case 'my_units':
      return row.unitId !== undefined && c.unitIds.includes(row.unitId);
    case 'my_vendor_org':
      return row.vendorOrgId === c.vendorOrgId;
    case 'my_projects':
      return row.projectId !== undefined && c.projectIds.includes(row.projectId);
  }
}

/** Does this row pass the scope? The in-memory twin of `toWhere`. */
export function matchesScope(row: ScopableRow, scope: ScopeFilter): boolean {
  if (scope.tenantId !== '*' && row.tenantId !== scope.tenantId) return false;

  if (scope.estateIds !== 'all') {
    // A row's estate is its siteId (estates and facilities are Sites, §8.1).
    const estate = row.estateId ?? row.siteId;
    // A row with no estate dimension is not estate-scoped; let it through.
    if (estate !== undefined && !scope.estateIds.includes(estate)) return false;
  }

  if (scope.buildingIds && scope.buildingIds !== 'all'
    && row.buildingId !== undefined && !scope.buildingIds.includes(row.buildingId)) return false;
  if (scope.unitIds && scope.unitIds !== 'all'
    && row.unitId !== undefined && !scope.unitIds.includes(row.unitId)) return false;

  if (scope.ownership) {
    if (scope.ownership.length === 0) {
      throw new Error('empty ownership clause — refusing to match every row');
    }
    return scope.ownership.some((c) => clauseMatches(row, c));
  }
  return true;
}

/** Filter a collection to the rows a scope admits. */
export function applyScope<T extends ScopableRow>(rows: readonly T[], scope: ScopeFilter): T[] {
  return rows.filter((r) => matchesScope(r, scope));
}
