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
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'assets_ppm', seed.ppmPlans, o),
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
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', seed.announcements, o),
  },
  sosEvents: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'security_sos', db.sosEvents, o),
  },
  bookings: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'bookings_amenities', db.bookings, o),
  },
  inspections: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'inspections_compliance', seed.inspections, o),
  },
  documents: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'announcements', seed.documents, o),
  },
  investorProjects: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'investor_projects', seed.investorProjects, o),
  },
  listings: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'marketplace', seed.listings, o),
  },
  marketplaceOrders: {
    list: (a: Actor, o?: ListOpts) => scopedList(a, 'marketplace', db.marketplaceOrders, o),
  },
  sites: {
    // Sites carry no per-row ownership; scoped by tenant + estate via siteId.
    all: (a: Actor) => scopedList(a, 'assets_ppm', seed.sites, { limit: 100 }).items,
  },
};

export { seed };
