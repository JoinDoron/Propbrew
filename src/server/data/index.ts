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

export const repos = {
  workOrders: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'work_orders', seed.workOrders as unknown as (ScopableRow & typeof seed.workOrders[number])[], o),
    get: (a: Actor, id: string) => scopedGet(a, 'work_orders', seed.workOrders as never, id),
  },
  assets: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'assets_ppm', seed.assets as never, o),
    get: (a: Actor, id: string) => scopedGet(a, 'assets_ppm', seed.assets as never, id),
  },
  ppmPlans: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'assets_ppm', seed.ppmPlans as never, o),
  },
  invoices: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'charges_invoicing', seed.invoices as never, o),
  },
  residents: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'users_roles', seed.residents as never, o),
  },
  vendors: {
    // Vendors are read via the work_orders capability (the proposed nav mapping).
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'work_orders', seed.vendors as never, o),
  },
  announcements: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'announcements', seed.announcements as never, o),
  },
  sosEvents: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'security_sos', seed.sosEvents as never, o),
  },
  bookings: {
    list: (a: Actor, o?: { cursor?: string | null; limit?: number }) =>
      scopedList(a, 'bookings_amenities', seed.bookings as never, o),
  },
  sites: {
    // Sites carry no per-row ownership; scoped by tenant + estate via siteId.
    all: (a: Actor) => scopedList(a, 'assets_ppm', seed.sites as never, { limit: 100 }).items,
  },
};

export { seed };
