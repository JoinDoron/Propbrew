import 'server-only';

/**
 * The Data Access Layer (Next 16 guide: DAL for new projects).
 *
 * Every read opens the same way — derive the actor, assert the capability to get
 * a ScopeFilter, apply that filter INSIDE the adapter, paginate — so a scope bug
 * is reproducible today without a database and the conformance tests transfer
 * unchanged to the future HTTP adapter. No function accepts a tenantId or
 * estateId from the caller; scope comes only from the session actor (§8.2).
 *
 * Today the adapter is the in-memory seed. Swapping `DATA_SOURCE` to `http`
 * later changes this file only — no page or component imports an adapter.
 */

import { assertCan, applyScope, type Action, type Actor, type Capability, type ScopableRow } from '@/lib/authz';
import type { Page } from '@/domain/primitives';
import * as seed from './seed/fixtures';
import { db } from './store';
import { currentRecordContext, durableRecordsEnabled } from './record-context';

const DEFAULT_PAGE = 50;

/** These legacy read-only registers have no mutable collection in the current
 * schema. Use one when supplied by a future schema; native companies otherwise
 * see an empty register, while the private sample retains its fixture records. */
function fixtureOrStoredRows<T extends ScopableRow>(name: string, fixtures: readonly T[]): readonly T[] {
  const context = currentRecordContext();
  if (!context) {
    if (durableRecordsEnabled()) throw new Error('Database records must be read inside an authenticated record context.');
    return fixtures;
  }
  const rows = context.state.collections[name];
  if (rows !== undefined) {
    if (!Array.isArray(rows)) throw new Error('Stored record collection is invalid.');
    return rows as T[];
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.domainTenantId) ? [] : fixtures;
}

/** Assert the capability, scope the rows in-memory, and paginate. */
function scopedList<T extends ScopableRow>(
  actor: Actor,
  capability: Capability,
  rows: readonly T[],
  opts: { cursor?: string | null; limit?: number; action?: Action } = {},
): Page<T> {
  const scope = assertCan(actor, capability, opts.action ?? 'read'); // throws ForbiddenError → notFound()
  const scoped = applyScope(rows, scope);
  const limit = opts.limit ?? DEFAULT_PAGE;
  const start = opts.cursor ? Number(opts.cursor) : 0;
  const items = scoped.slice(start, start + limit);
  const nextStart = start + limit;
  return { items, total: scoped.length, cursor: nextStart < scoped.length ? String(nextStart) : null };
}

/** Scoped single-record fetch. Returns null on miss OR out-of-scope (§8.2). */
function scopedGet<T extends ScopableRow & { id: string }>(
  actor: Actor,
  capability: Capability,
  rows: readonly T[],
  id: string,
): T | null {
  const scope = assertCan(actor, capability, 'read');
  const [match] = applyScope(rows.filter((r) => r.id === id), scope);
  return match ?? null;
}

/**
 * Scoped mutable lookup for server actions.
 *
 * Reads were already forced through `scopedList`, but several mutation paths
 * loaded `db.*` by id after checking only the capability. That is insufficient:
 * a caller can submit another tenant's id even when the UI never exposes it.
 * Mutations must resolve the row through the same tenant/estate/ownership
 * predicate as reads before changing the object.
 */
export function scopedMutableGet<T extends ScopableRow & { id: string }>(
  actor: Actor,
  capability: Capability,
  rows: readonly T[],
  id: string,
  action: Action = 'update',
): T | null {
  const scope = assertCan(actor, capability, action);
  const [match] = applyScope(rows.filter((r) => r.id === id), scope);
  return match ?? null;
}

/** Construction tasks need their own identity projected into the scope engine.
 * A task id is not a project id, so applying the generic mutable lookup to the
 * raw row would enforce the project boundary but silently skip an assigned-task
 * boundary. Keep that projection in the DAL for reads and writes alike. */
export function scopedConstructionTaskGet(
  actor: Actor,
  id: string,
  action: Action = 'read',
) {
  const scope = assertCan(actor, 'reports_analytics', action);
  const [match] = applyScope(db.constructionTasks
    .filter((task) => task.id === id)
    .map((task) => ({ tenantId: task.tenantId, projectId: task.projectId, constructionTaskId: task.id, task })), scope);
  return match?.task ?? null;
}

/** Project.id is the Construction access key. Some legacy projects also carry
 * an investor-facing projectId, so generic lookup must not use that field as
 * the security dimension. */
export function scopedConstructionProjectGet(
  actor: Actor,
  id: string,
  action: Action = 'read',
) {
  const scope = assertCan(actor, 'reports_analytics', action);
  const [match] = applyScope(db.constructionProjects
    .filter((project) => project.id === id)
    .map((project) => ({ tenantId: project.tenantId, projectId: project.id, project })), scope);
  return match?.project ?? null;
}

/** RFQs inherit package scope from their originating purchase request. */
export function scopedConstructionRfqGet(
  actor: Actor,
  id: string,
  action: Action = 'read',
) {
  const scope = assertCan(actor, 'reports_analytics', action);
  const candidates = db.constructionRfqs.filter((rfq) => rfq.id === id).map((rfq) => {
    const request = db.constructionRequests.find((row) => row.tenantId === rfq.tenantId && row.projectId === rfq.projectId && row.ref === rfq.requestRef);
    return { tenantId: rfq.tenantId, projectId: rfq.projectId, costCode: request?.costCode, rfq };
  });
  const [match] = applyScope(candidates, scope);
  return match?.rfq ?? null;
}

/* --- repositories --------------------------------------------------------- */

type ListOpts = { cursor?: string | null; limit?: number };
function omitScopeKey<T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

/**
 * A Site's own id is its estate scope key. Keep that adapter-only projection
 * separate from the public Site shape: otherwise an estate-less Site row would
 * bypass the scope engine's estate predicate and expose unassigned properties.
 */
function scopedSites(actor: Actor, opts?: ListOpts) {
  const page = scopedList(actor, 'assets_ppm', db.sites.map((site) => ({
    tenantId: site.tenantId, siteId: site.id, site,
  })), opts);
  return { ...page, items: page.items.map(({ site }) => site) };
}

/** Unit identity is available to ownership predicates without changing Unit. */
function scopedUnits(actor: Actor, opts?: ListOpts) {
  const page = scopedList(actor, 'assets_ppm', db.units.map((unit) => ({
    tenantId: unit.tenantId, siteId: unit.siteId, unitId: unit.id, unit,
  })), opts);
  return { ...page, items: page.items.map(({ unit }) => unit) };
}

export const repos = {
  workOrders: {
    // Reads the mutable store, not the seed — transitions are visible here.
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'work_orders', db.workOrders, o),
    get: (a: Actor, id: string) => scopedGet(a, 'work_orders', db.workOrders, id),
    /** Scoped lookup by human ref (e.g. "WO-24817"); null if out of scope. */
    getByRef: (a: Actor, ref: string) => {
      const scope = assertCan(a, 'work_orders', 'read');
      const [match] = applyScope(db.workOrders.filter((w) => w.ref === ref), scope);
      return match ?? null;
    },
  },
  assets: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', fixtureOrStoredRows('assets', seed.assets), o),
    get: (a: Actor, id: string) => scopedGet(a, 'assets_ppm', fixtureOrStoredRows('assets', seed.assets), id),
  },
  ppmPlans: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.ppmPlans, o),
  },
  ppmOccurrences: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.ppmOccurrences, o),
  },
  wallets: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'charges_invoicing', db.wallets, o),
  },
  invoices: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'charges_invoicing', db.invoices, o),
    getByRef: (a: Actor, ref: string) => {
      const scope = assertCan(a, 'charges_invoicing', 'read');
      const [m] = applyScope(db.invoices.filter((i) => i.ref === ref), scope);
      return m ?? null;
    },
  },
  residents: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'users_roles', db.residents, o),
  },
  vendors: {
    // Vendors are read via the work_orders capability (the proposed nav mapping).
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'work_orders', db.vendors, o),
  },
  announcements: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.announcements, o),
  },
  sosEvents: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'security_sos', db.sosEvents, o),
  },
  bookings: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.bookings, o),
  },
  inspections: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'inspections_compliance', db.inspections, o),
  },
  complianceObligations: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'inspections_compliance', db.complianceObligations, o),
  },
  documents: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.documents, o),
  },
  investorProjects: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'investor_projects', fixtureOrStoredRows('investorProjects', seed.investorProjects), o),
  },
  listings: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'marketplace', db.listings, o),
    /** The marketplace CATALOG is estate-public: any resident may browse the
     *  active listings on their estate. Unlike orders, a listing has no owner,
     *  so it is scoped by tenant + estate only (not by the O ownership clause,
     *  which would drop every row). Read access is still gated by the page. */
    catalog: (a: Actor) => applyScope(db.listings, { tenantId: a.tenantId ?? '', estateIds: a.allEstates ? 'all' : a.estateIds, ownership: null }),
  },
  marketplaceOrders: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'marketplace', db.marketplaceOrders, o),
  },
  sites: {
    list: (a: Actor, o?: ListOpts) => scopedSites(a, o),
    all: (a: Actor) => scopedSites(a, { limit: 100 }).items,
  },
  units: {
    list: (a: Actor, o?: ListOpts) => scopedUnits(a, o),
  },
  buildings: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.buildings, o),
  },

  /* --- Short-Let PMS (new module). Rides the §7 bookings capability (the
   *  matrix is CR-locked); rows are tenant-scoped, no estate/ownership column,
   *  so the operator (estate_manager/executive) sees the whole portfolio. */
  shortletProperties: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletProperties, o ?? { limit: 100 }),
  },
  shortletApartments: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletApartments, o ?? { limit: 100 }),
  },
  shortletBookings: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletBookings, o ?? { limit: 200 }),
  },
  shortletExpenses: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletExpenses, o ?? { limit: 200 }),
  },
  shortletInspections: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletInspections, o ?? { limit: 100 }),
  },
  shortletTeam: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletTeam, o ?? { limit: 100 }),
  },
  shortletPricingRules: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletPricingRules, o ?? { limit: 200 }),
  },
  shortletIssues: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletIssues, o ?? { limit: 200 }),
  },
  shortletAgents: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletAgents, o ?? { limit: 100 }),
  },
  shortletReviews: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.shortletReviews, o ?? { limit: 200 }),
  },

  /* --- Facility Intelligence (gated by assets_ppm — facility manager M). --- */
  buildingSystems: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.buildingSystems, o ?? { limit: 100 }) },
  facilitySensors: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilitySensors, o ?? { limit: 100 }) },
  facilityAlarms: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityAlarms, o ?? { limit: 100 }) },
  facilityGenerators: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityGenerators, o ?? { limit: 100 }) },
  facilityMeters: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityMeters, o ?? { limit: 100 }) },
  facilityParts: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityParts.filter((part) => !currentRecordContext()?.companyPrincipal || a.allEstates || Boolean(part.siteId)), o ?? { limit: 200 }) },
  facilityContracts: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityContracts, o ?? { limit: 100 }) },
  facilityPermits: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityPermits, o ?? { limit: 100 }) },
  facilityIncidents: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityIncidents, o ?? { limit: 100 }) },
  accessPoints: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.accessPoints, o ?? { limit: 100 }) },
  visitorPasses: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.visitorPasses, o ?? { limit: 200 }) },
  accessEvents: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.accessEvents, o ?? { limit: 200 }) },
  sustainabilityTargets: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.sustainabilityTargets, o ?? { limit: 100 }) },
  emissionMonths: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.emissionMonths, o ?? { limit: 100 }) },

  /* --- Estate Experience (community/collections/tenancy/parcels) ----------- */
  residentFeedback: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.residentFeedback, o ?? { limit: 100 }) },
  engagementSnapshot: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.engagementSnapshot, o ?? { limit: 10 }) },
  complaints: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.complaints, o ?? { limit: 100 }) },
  collectionCases: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'charges_invoicing', db.collectionCases, o ?? { limit: 100 }) },
  tenancies: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'users_roles', db.tenancies, o ?? { limit: 100 }) },
  lockers: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'security_sos', db.lockers, o ?? { limit: 100 }) },
  parcels: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'security_sos', db.parcels, o ?? { limit: 100 }) },
  motions: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.motions, o ?? { limit: 100 }) },
  communityEvents: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.communityEvents, o ?? { limit: 100 }) },
  rewardMembers: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.rewardMembers, o ?? { limit: 100 }) },
  perks: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.perks, o ?? { limit: 100 }) },
  boardMembers: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.boardMembers, o ?? { limit: 50 }) },
  meetings: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.meetings, o ?? { limit: 50 }) },
  boardElections: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.boardElections, o ?? { limit: 20 }) },

  /* --- Construction (ConstructionOS) — all reports_analytics-gated ---------- */
  constructionProjects: { list: (a: Actor, o?: ListOpts) => {
    const page = scopedList(a, 'reports_analytics', db.constructionProjects.map((project) => ({
      tenantId: project.tenantId,
      // Native company memberships use the permanent Construction record id;
      // the legacy investor role still owns its investor-facing project ref.
      projectId: a.companyAccess ? project.id : project.projectId ?? project.id,
      project,
    })), o ?? { limit: 50 });
    return { ...page, items: page.items.map(({ project }) => project) };
  } },
  constructionPhases: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionPhases, o ?? { limit: 200 }) },
  constructionTasks: { list: (a: Actor, o?: ListOpts) => {
    const page = scopedList(a, 'reports_analytics', db.constructionTasks.map((task) => ({ ...task, constructionTaskId: task.id })), o ?? { limit: 500 });
    return { ...page, items: page.items.map((task) => omitScopeKey(task, 'constructionTaskId')) };
  } },
  constructionMilestones: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionMilestones, o ?? { limit: 200 }) },
  constructionIssues: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionIssues, o ?? { limit: 200 }) },
  constructionReports: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionReports, o ?? { limit: 200 }) },
  constructionVendors: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionVendors, o ?? { limit: 100 }) },
  constructionRequests: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionRequests, o ?? { limit: 200 }) },
  constructionRfqs: { list: (a: Actor, o?: ListOpts) => {
    const page = scopedList(a, 'reports_analytics', db.constructionRfqs.map((rfq) => {
      const request = db.constructionRequests.find((row) => row.tenantId === rfq.tenantId && row.projectId === rfq.projectId && row.ref === rfq.requestRef);
      return { ...rfq, costCode: request?.costCode };
    }), o ?? { limit: 100 });
    return { ...page, items: page.items.map((rfq) => omitScopeKey(rfq, 'costCode')) };
  } },
  constructionOrders: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionOrders, o ?? { limit: 200 }) },
  constructionMaterials: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionMaterials, o ?? { limit: 200 }) },
  constructionWarehouses: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionWarehouses, o ?? { limit: 50 }) },
  constructionStock: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionStock, o ?? { limit: 500 }) },
  constructionMovements: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionMovements, o ?? { limit: 500 }) },
  constructionCostCodes: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionCostCodes, o ?? { limit: 200 }) },
  constructionVariations: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionVariations.filter((row) => {
    if (a.constructionSubcontractorIds && (!row.subcontractorId || !a.constructionSubcontractorIds.includes(row.subcontractorId))) return false;
    if (a.constructionPackageIds === undefined) return true;
    if (!row.workPackageId) return false;
    const project = db.constructionProjects.find((item) => item.tenantId === row.tenantId && item.id === row.projectId);
    const pack = project?.mobilisation?.workPackages.find((item) => item.id === row.workPackageId);
    return a.constructionPackageIds.includes(row.workPackageId)
      || Boolean(pack?.costCode && a.constructionPackageIds.includes(`${row.projectId}:${pack.costCode}`));
  }), o ?? { limit: 100 }) },
  constructionWorkers: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionWorkers, o ?? { limit: 300 }) },
  constructionAttendance: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionAttendance, o ?? { limit: 500 }) },
  constructionDocs: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionDocs, o ?? { limit: 200 }) },
  constructionReasonCodes: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionReasonCodes, o ?? { limit: 100 }) },
  constructionReasonEvents: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionReasonEvents, o ?? { limit: 500 }) },
  constructionApprovalRules: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionApprovalRules, o ?? { limit: 50 }) },
  constructionApprovals: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionApprovals, o ?? { limit: 200 }) },
  constructionAudit: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionAudit, o ?? { limit: 500 }) },
  constructionFxRates: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionFxRates, o ?? { limit: 50 }) },
  constructionTimesheets: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionTimesheets, o ?? { limit: 200 }) },
  constructionTransmittals: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionTransmittals, o ?? { limit: 200 }) },
  constructionZones: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionZones, o ?? { limit: 200 }) },
  constructionSubcontractors: { list: (a: Actor, o?: ListOpts) => {
    const page = scopedList(a, 'reports_analytics', db.constructionSubcontractors.map((subcontractor) => ({ ...subcontractor, subcontractorId: subcontractor.id })), o ?? { limit: 100 });
    return { ...page, items: page.items.map((subcontractor) => omitScopeKey(subcontractor, 'subcontractorId')) };
  } },
  constructionSafetyPermits: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionSafetyPermits, o ?? { limit: 200 }) },
  constructionSafetyEvents: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionSafetyEvents, o ?? { limit: 200 }) },
  constructionToolboxTalks: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionToolboxTalks, o ?? { limit: 100 }) },
  constructionRfis: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionRfis, o ?? { limit: 200 }) },
  proxyAssignments: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', db.proxyAssignments, o ?? { limit: 200 }) },
};

/**
 * Runtime feeds carry no estate column, so they are JOINED onto the actor's
 * already-scoped asset set (never scanned globally) — §8.2 isolation is
 * inherited from the asset scope.
 */
export function runtimeForActor(actor: Actor) {
  const assets = applyScope(fixtureOrStoredRows('assets', seed.assets), assertCan(actor, 'assets_ppm', 'read'));
  const ids = new Set(assets.map((x) => `${x.tenantId}:${x.id}`));
  return db.assetRuntime.filter((r) => ids.has(`${r.tenantId}:${r.assetId}`));
}

export { seed };
