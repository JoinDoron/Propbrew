import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, isValidElement, type ReactNode } from 'react';
import type { Actor } from '@/lib/authz';
import { identityByKey } from '@/server/identities';
import type { DevIdentity } from '@/server/identities';
import type { Announcement, Booking, Invoice, Resident, Site, SosEvent, Unit, WorkOrder } from '@/domain/entities';
import { money } from '@/domain/primitives';

const boundary = vi.hoisted(() => ({
  requireOperatorSession: vi.fn(),
  devIdentityEnabled: vi.fn(),
  lists: {
    sites: vi.fn(), units: vi.fn(), residents: vi.fn(), invoices: vi.fn(),
    workOrders: vi.fn(), sosEvents: vi.fn(), bookings: vi.fn(), announcements: vi.fn(),
  },
}));

vi.mock('@/server/workspaces', () => ({ requireOperatorSession: boundary.requireOperatorSession }));
vi.mock('@/server/session', () => ({ devIdentityEnabled: boundary.devIdentityEnabled }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Next's navigation internals are not part of this server-data disclosure test.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement('a', { ...props, href }, children),
}));
vi.mock('@/server/data', () => ({
  repos: {
    sites: { list: boundary.lists.sites },
    units: { list: boundary.lists.units },
    residents: { list: boundary.lists.residents },
    invoices: { list: boundary.lists.invoices },
    workOrders: { list: boundary.lists.workOrders },
    sosEvents: { list: boundary.lists.sosEvents },
    bookings: { list: boundary.lists.bookings },
    announcements: { list: boundary.lists.announcements },
  },
}));

import { EstateHome } from '@/components/workspaces/estate-home';

const PRIVATE = {
  property: 'RESTRICTED_PROPERTY_SECRET',
  unit: 'RESTRICTED_UNIT_SECRET',
  resident: 'RESTRICTED_RESIDENT_SECRET',
  finance: 'RESTRICTED_FINANCE_SECRET',
  maintenance: 'RESTRICTED_MAINTENANCE_SECRET',
};

const site = {
  tenantId: 't-lekki', id: 's-gardens', kind: 'estate', name: PRIVATE.property,
  address: '14 Example Road, Lagos', buildingCount: 1, unitCount: 2,
} as unknown as Site;
const units = [
  { tenantId: 't-lekki', id: 'unit-a', siteId: site.id, buildingId: 'building-a', label: PRIVATE.unit, type: 'Apartment', occupancy: 'occupied' },
  { tenantId: 't-lekki', id: 'unit-b', siteId: site.id, buildingId: 'building-a', label: 'Unit B', type: 'Apartment', occupancy: 'vacant' },
] as unknown as Unit[];
const resident = {
  tenantId: 't-lekki', id: 'resident-a', userId: 'user-a', name: PRIVATE.resident,
  unitId: 'unit-a', siteId: site.id, status: 'active', household: 2,
  balance: money(4_000_000), moveInDate: '2026-01-01',
} as unknown as Resident;

function invoice(currency: 'NGN' | 'USD', amountMinor: number, paidMinor: number): Invoice {
  return {
    tenantId: 't-lekki', id: `invoice-${currency}`, ref: `INV-${currency}`, unitId: 'unit-a',
    estateId: site.id, residentName: PRIVATE.finance, ownerUserId: 'user-a',
    description: 'Service charge', status: 'partially_paid',
    amount: money(amountMinor, currency), paid: money(paidMinor, currency),
    dueDate: '2026-07-15', agingDays: 11,
  } as unknown as Invoice;
}

const workOrder = {
  tenantId: 't-lekki', id: 'order-a', ref: 'WO-TEST', title: PRIVATE.maintenance,
  siteId: site.id, estateId: site.id, unitId: 'unit-a', status: 'in_progress', priority: 'high',
  origin: 'resident_request', requesterUserId: 'user-a', requesterName: PRIVATE.resident,
  assigneeName: 'Visible technician', respondDueAt: '2026-07-25T10:00:00Z',
  resolveDueAt: '2026-07-27T10:00:00Z', cost: null,
  createdAt: '2026-07-24T10:00:00Z', createdBy: 'user-a',
  updatedAt: '2026-07-25T10:00:00Z', updatedBy: 'user-a',
} as unknown as WorkOrder;
const sos = {
  tenantId: 't-lekki', id: 'sos-a', ref: 'SOS-TEST', estateId: site.id, unitId: 'unit-a',
  residentName: 'Visible SOS resident', ownerUserId: 'user-visible', status: 'raised',
  raisedAt: '2026-07-26T08:50:00Z', acknowledgedAt: null, ackSeconds: null,
  responder: null, channel: 'in_app',
} as unknown as SosEvent;
const booking = {
  tenantId: 't-lekki', id: 'booking-a', amenity: 'Visible clubhouse', estateId: site.id,
  ownerUserId: 'user-visible', residentName: 'Visible amenity resident', status: 'requested',
  slot: '2026-07-27T10:00:00Z', fee: null,
} as unknown as Booking;
const announcement = {
  tenantId: 't-lekki', id: 'announcement-a', title: 'Visible community announcement',
  body: 'Water maintenance starts tomorrow.', estateId: site.id, scope: 'estate',
  audience: 'All residents', sentAt: '2026-07-25T10:00:00Z', delivered: 10, read: 6, aiDrafted: false,
} as unknown as Announcement;

function actAs(key: string): DevIdentity {
  const session = identityByKey(key);
  boundary.requireOperatorSession.mockResolvedValue(session);
  return session;
}

function page<T>(items: T[]) {
  return { items: structuredClone(items), total: items.length, cursor: null };
}

function forbidReads(...names: (keyof typeof boundary.lists)[]) {
  for (const name of names) {
    boundary.lists[name].mockImplementation(() => { throw new Error(`Forbidden repository read: ${name}`); });
  }
}

async function view(currency?: 'NGN' | 'USD') {
  const tree = await EstateHome(currency ? { currency } : {});
  // Preserve all element props, including payloads passed to child components,
  // without traversing React's component-type/debug internals or module cycles.
  const serialized = JSON.stringify(tree, (_key, value) => isValidElement(value) ? { props: value.props } : value);
  return { tree: serialized, html: renderToStaticMarkup(tree) };
}

beforeEach(() => {
  vi.resetAllMocks();
  actAs('estate_manager');
  boundary.devIdentityEnabled.mockReturnValue(true);
  boundary.lists.sites.mockReturnValue(page([site]));
  boundary.lists.units.mockReturnValue(page(units));
  boundary.lists.residents.mockReturnValue(page([resident]));
  boundary.lists.invoices.mockReturnValue(page([invoice('NGN', 10_000_000, 6_000_000), invoice('USD', 200_000, 123_400)]));
  boundary.lists.workOrders.mockReturnValue(page([workOrder]));
  boundary.lists.sosEvents.mockReturnValue(page([sos]));
  boundary.lists.bookings.mockReturnValue(page([booking]));
  boundary.lists.announcements.mockReturnValue(page([announcement]));
});

describe('Estate overview server rendering and authorization', () => {
  it('renders the completed overview sections for an estate manager', async () => {
    const { html } = await view();
    expect(html).toContain('Welcome back,');
    for (const label of ['Collection trends', 'Portfolio pulse', 'Property performance', 'Maintenance summary', 'Analytics snapshot']) expect(html).toContain(label);
    for (const label of ['Total properties', 'Active residents / tenants', 'Occupancy rate', 'Charges collected']) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain(PRIVATE.property);
    for (const read of Object.values(boundary.lists)) expect(read).toHaveBeenCalledOnce();
  });

  it('does not query or serialize finance, residents, properties or maintenance for Security', async () => {
    const session = actAs('security');
    const hidden = ['sites', 'units', 'residents', 'invoices', 'workOrders'] as const;
    forbidReads(...hidden);
    const { tree, html } = await view();
    for (const name of hidden) expect(boundary.lists[name]).not.toHaveBeenCalled();
    for (const secret of Object.values(PRIVATE)) {
      expect(tree).not.toContain(secret);
      expect(html).not.toContain(secret);
    }
    expect(html).not.toContain('Collection rate');
    expect(html).not.toContain('Outstanding charges');
    for (const label of ['Total properties', 'Active residents / tenants', 'Occupancy rate', 'Charges collected', 'Property performance', 'Maintenance summary', 'Collection trends', 'Portfolio pulse']) expect(html).not.toContain(label);
    expect(html).not.toContain('Overview currency');
    expect(boundary.lists.sosEvents).toHaveBeenCalledWith(session.actor, expect.any(Object));
    expect(boundary.lists.bookings).toHaveBeenCalledWith(session.actor, expect.any(Object));
    expect(boundary.lists.announcements).toHaveBeenCalledWith(session.actor, expect.any(Object));
  });

  it('does not query or render financial cards for a Facility manager', async () => {
    const session = actAs('facility_manager');
    forbidReads('invoices', 'sosEvents', 'bookings');
    const { tree, html } = await view();
    expect(boundary.lists.invoices).not.toHaveBeenCalled();
    expect(boundary.lists.sosEvents).not.toHaveBeenCalled();
    expect(boundary.lists.bookings).not.toHaveBeenCalled();
    expect(tree).not.toContain(PRIVATE.finance);
    expect(html).not.toContain(PRIVATE.finance);
    expect(html).not.toContain('60,000');
    expect(html).not.toContain('1,234');
    expect(html).not.toContain('Collection rate');
    expect(html).not.toContain('Outstanding charges');
    for (const label of ['Charges collected', 'Collection trends', 'Portfolio pulse', 'Overview currency', 'Invoices fully settled']) expect(html).not.toContain(label);
    expect(html).toContain(PRIVATE.property);
    expect(boundary.lists.workOrders).toHaveBeenCalledWith(session.actor, expect.any(Object));
  });

  it('defaults financial totals to NGN without adding USD balances', async () => {
    const { html } = await view();
    expect(html).toContain('60,000');
    expect(html).not.toContain('1,234');
    expect(html).not.toContain('61,234');
  });

  it('honors the selected USD currency without adding NGN balances', async () => {
    const { html } = await view('USD');
    expect(html).toContain('1,234');
    expect(html).not.toContain('60,000');
    expect(html).not.toContain('61,234');
  });

  it('derives all repository reads from the same authenticated Actor', async () => {
    const session = actAs('estate_manager');
    const original: Actor = structuredClone(session.actor);
    await view();
    for (const read of Object.values(boundary.lists)) {
      for (const [actor] of read.mock.calls) expect(actor).toBe(session.actor);
    }
    expect(session.actor).toEqual(original);
  });
});
