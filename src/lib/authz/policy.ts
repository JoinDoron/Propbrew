/**
 * Action algebra + ownership predicates.
 *
 * The §7 legend gives levels, not verbs. This file turns a level into a verb
 * set, and turns "O" into the specific row-level predicate each cell means.
 *
 * Per-cell entries are PROPOSED under §7: "Fine-grained permissions per endpoint
 * are finalised at design; this matrix is the authoritative baseline." Every
 * entry cites the requirement it derives from. Overrides NARROW only — enforced
 * at runtime by intersection, and asserted in CI.
 */

import { levelFor, type Capability, type Level, type Role } from './matrix';

export const ACTIONS = [
  'read',
  'export', // FM-07: "export CSV/PDF; role-scoped visibility per §7"
  'create',
  'update',
  'archive', // FM-01: "Archive (no hard delete)" — there is no `delete`
  'approve',
  'transition', // drive a §10 state machine
  'configure',
] as const;
export type Action = (typeof ACTIONS)[number];

/** Default verb set per level, derived from the §7 legend wording. */
const LEVEL_ACTIONS: Readonly<Record<Level, readonly Action[]>> = {
  F: ['read', 'export', 'create', 'update', 'archive', 'approve', 'transition', 'configure'],
  // "manage (create/edit within own tenant/estate)" — notably NOT `configure`,
  // which is Platform Admin's tenant setup (SC-07, §8.2).
  M: ['read', 'export', 'create', 'update', 'archive', 'approve', 'transition'],
  V: ['read', 'export'],
  // own records only — same verbs, every one row-filtered. NOT a weaker V.
  O: ['read', 'export', 'create', 'update', 'archive', 'transition'],
  none: [],
};

type Cell = `${Role}:${Capability}`;

/** PROPOSED per-cell narrowing. Subset of the cell's level actions, always. */
const CELL_ACTIONS: Partial<Record<Cell, readonly Action[]>> = {
  // FM-03: "receive, update and close". WOs originate from EM-03 requests, the
  // FM-02 scheduler and FM-06 failed items — never from a technician.
  'technician:work_orders': ['read', 'update', 'transition'],
  'technician:inspections_compliance': ['read', 'update', 'transition'],
  // FM-05: "Vendors receive assignments and submit updates & invoices".
  'vendor:work_orders': ['read', 'update', 'transition'],
  // EM-03: raise + photos + rate. Not the §10 state machine.
  'resident:work_orders': ['read', 'create', 'update'],
  // EM-01: "Statements per unit/resident" — read, not invoice authoring.
  'resident:charges_invoicing': ['read', 'export'],
  // SC-02: initiate + receipt. Payments are webhook-confirmed and idempotent,
  // therefore never client-editable.
  'resident:payments_in_app': ['read', 'create'],
  // EM-06 SOS raise + EM-02 visitor pass issue. Acknowledge/respond is Sec 'M'.
  'resident:security_sos': ['read', 'create'],
  // EM-05: book + cancel per policy.
  'resident:bookings_amenities': ['read', 'create', 'archive'],
  // EM-09: order + cancel. Listings are vendor-side.
  'resident:marketplace': ['read', 'create', 'archive'],
  // EM-02: own profile + household members.
  'resident:users_roles': ['read', 'create', 'update'],
  // FM-05: vendor profile, services, coverage, insurance/cert documents.
  'vendor:users_roles': ['read', 'update'],
  // EM-09: listings + Placed→Accepted→Fulfilled→Closed.
  'vendor:marketplace': ['read', 'create', 'update', 'archive', 'transition'],
  'investor:users_roles': ['read', 'update'],
  // SC-08: "investors see only their projects" — read-only.
  'investor:investor_projects': ['read', 'export'],
  'investor:reports_analytics': ['read', 'export'],
  // §7 gives EstM 'V' on tenant config: reads amenity rules / charge structures
  // / branding that Platform Admin set (SC-07). Cannot change them.
  'estate_manager:tenant_config': ['read'],
};

/** Verbs a role may perform on a capability. Intersection => narrowing only. */
export function actionsFor(role: Role, capability: Capability): readonly Action[] {
  const base = LEVEL_ACTIONS[levelFor(role, capability)] ?? [];
  const override = CELL_ACTIONS[`${role}:${capability}` as Cell];
  return override ? override.filter((a) => base.includes(a)) : base;
}

/* ------------------------------------------------------------------ */
/* Ownership — what "O" actually means, per cell                       */
/* ------------------------------------------------------------------ */

export type OwnershipKey =
  | 'self' // record.userId === actor.userId
  | 'requested_by_me' // record.requesterUserId === actor.userId
  | 'assigned_to_me' // record.assigneeUserId === actor.userId
  | 'my_units' // record.unitId ∈ actor.unitIds  (household)
  | 'my_vendor_org' // record.vendorOrgId === actor.vendorOrgId
  | 'my_projects'; // record.projectId ∈ actor.investorProjectIds

/**
 * OR semantics within a cell.
 *
 * Ownership is NOT exclusive to level 'O': `investor:reports_analytics` is 'V'
 * in §7 but SC-08 constrains investors to their own projects, so the V cell
 * carries a clause too.
 */
export const OWNERSHIP: Partial<Record<Cell, readonly OwnershipKey[]>> = {
  'resident:users_roles': ['self', 'my_units'], // EM-02 household members
  'vendor:users_roles': ['my_vendor_org'], // FM-05
  'investor:users_roles': ['self'],
  'technician:work_orders': ['assigned_to_me'], // FM-03
  'resident:work_orders': ['requested_by_me', 'my_units'], // EM-03
  'vendor:work_orders': ['my_vendor_org'], // FM-03 / FM-05
  'technician:inspections_compliance': ['assigned_to_me'], // FM-06
  'resident:charges_invoicing': ['my_units', 'self'], // EM-01 statements
  'resident:payments_in_app': ['self'], // SC-02
  'resident:bookings_amenities': ['self'], // EM-05
  'resident:security_sos': ['self', 'my_units'], // EM-06 / EM-02
  'resident:marketplace': ['self'], // EM-09
  'vendor:marketplace': ['my_vendor_org'], // EM-09
  'investor:investor_projects': ['my_projects'], // SC-08
  'investor:reports_analytics': ['my_projects'], // SC-08 narrows the §7 'V'
};

export function ownershipKeysFor(role: Role, capability: Capability): readonly OwnershipKey[] | null {
  return OWNERSHIP[`${role}:${capability}` as Cell] ?? null;
}

/**
 * Estate scoping. §8.1: roles are "scoped to tenant (and estate where relevant)"
 * — the PRD does NOT enumerate which. PROPOSED baseline, confirm at discovery.
 */
export const ESTATE_SCOPED_ROLES: ReadonlySet<Role> = new Set<Role>([
  'estate_manager',
  'facility_manager',
  'security',
  'technician',
]);
