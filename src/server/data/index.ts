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

const DEFAULT_PAGE = 50;

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

/* --- repositories --------------------------------------------------------- */

type ListOpts = { cursor?: string | null; limit?: number };

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
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', seed.assets, o),
    get: (a: Actor, id: string) => scopedGet(a, 'assets_ppm', seed.assets, id),
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
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'users_roles', seed.residents, o),
  },
  vendors: {
    // Vendors are read via the work_orders capability (the proposed nav mapping).
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'work_orders', seed.vendors, o),
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
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'investor_projects', seed.investorProjects, o),
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
    // Sites carry no per-row ownership; scoped by tenant + estate via siteId.
    all: (a: Actor) => scopedList(a, 'assets_ppm', seed.sites, { limit: 100 }).items,
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
  facilityParts: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', db.facilityParts, o ?? { limit: 200 }) },
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
  constructionProjects: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionProjects, o ?? { limit: 50 }) },
  constructionPhases: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionPhases, o ?? { limit: 200 }) },
  constructionTasks: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionTasks, o ?? { limit: 500 }) },
  constructionMilestones: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionMilestones, o ?? { limit: 200 }) },
  constructionIssues: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionIssues, o ?? { limit: 200 }) },
  constructionReports: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionReports, o ?? { limit: 200 }) },
  constructionVendors: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionVendors, o ?? { limit: 100 }) },
  constructionRequests: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionRequests, o ?? { limit: 200 }) },
  constructionRfqs: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionRfqs, o ?? { limit: 100 }) },
  constructionOrders: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionOrders, o ?? { limit: 200 }) },
  constructionMaterials: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionMaterials, o ?? { limit: 200 }) },
  constructionWarehouses: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionWarehouses, o ?? { limit: 50 }) },
  constructionStock: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionStock, o ?? { limit: 500 }) },
  constructionMovements: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionMovements, o ?? { limit: 500 }) },
  constructionCostCodes: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionCostCodes, o ?? { limit: 200 }) },
  constructionVariations: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionVariations, o ?? { limit: 100 }) },
  constructionWorkers: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionWorkers, o ?? { limit: 300 }) },
  constructionAttendance: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionAttendance, o ?? { limit: 500 }) },
  constructionDocs: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionDocs, o ?? { limit: 200 }) },
  constructionTimesheets: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionTimesheets, o ?? { limit: 200 }) },
  constructionTransmittals: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionTransmittals, o ?? { limit: 200 }) },
  constructionZones: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionZones, o ?? { limit: 200 }) },
  constructionSubcontractors: { list: (a: Actor, o?: ListOpts) => scopedList(a, 'reports_analytics', db.constructionSubcontractors, o ?? { limit: 100 }) },
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
  const ids = new Set(repos.assets.list(actor).items.map((x) => String(x.id)));
  return db.assetRuntime.filter((r) => ids.has(String(r.assetId)));
}

export { seed };
