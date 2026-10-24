import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site, Unit, WorkOrder } from '@/domain/entities';
import type { Actor } from '@/lib/authz';

const boundary = vi.hoisted(() => ({ sites: vi.fn(), units: vi.fn(), orders: vi.fn(), get: vi.fn() }));
vi.mock('@/server/data', () => ({ repos: {
  sites: { list: boundary.sites }, units: { list: boundary.units },
  workOrders: { list: boundary.orders, getByRef: boundary.get },
} }));

import { getEstateWorkOrder, listEstateWorkOrderSites, listEstateWorkOrderUnits, listEstateWorkOrders } from '@/server/reads/estate-work-orders';

const actor: Actor = { userId: 'manager-a', tenantId: 'tenant-a', roles: ['estate_manager'], estateIds: ['estate-a'], allEstates: false, unitIds: [], vendorOrgId: null, investorProjectIds: [] };
const sites = [
  { id: 'estate-a', tenantId: 'tenant-a', kind: 'estate' },
  { id: 'facility-a', tenantId: 'tenant-a', kind: 'facility' },
] as Site[];
const orders = [
  { id: 'job-a', ref: 'WO-A', tenantId: 'tenant-a', siteId: 'estate-a' },
  { id: 'job-b', ref: 'WO-B', tenantId: 'tenant-a', siteId: 'facility-a' },
  { id: 'job-foreign', ref: 'WO-FOREIGN', tenantId: 'tenant-b', siteId: 'estate-a' },
  { id: 'job-missing', ref: 'WO-MISSING', tenantId: 'tenant-a', siteId: 'missing-estate' },
] as WorkOrder[];

beforeEach(() => {
  vi.clearAllMocks();
  boundary.sites.mockReturnValue({ items: sites, total: 2, cursor: null });
  boundary.orders.mockReturnValue({ items: orders, total: 4, cursor: null });
  boundary.units.mockReturnValue({ items: [], total: 0, cursor: null });
  boundary.get.mockImplementation((_actor, ref) => orders.find((order) => order.ref === ref) ?? null);
});

describe('Estate-owned work-order read boundary', () => {
  it('restricts the register to tenant-matching authorised Estate properties', () => {
    expect(listEstateWorkOrderSites(actor).map((site) => site.id)).toEqual(['estate-a']);
    expect(listEstateWorkOrders(actor).map((order) => order.ref)).toEqual(['WO-A']);
    expect(boundary.orders).toHaveBeenCalledWith(actor, { cursor: null, limit: 200 });
  });

  it.each(['WO-B', 'WO-FOREIGN', 'WO-MISSING', 'WO-NOT-FOUND'])('does not expose the out-of-Estate detail %s', (ref) => {
    expect(getEstateWorkOrder(actor, ref)).toBeNull();
  });

  it('keeps the existing record identity rather than duplicating a Facility work order', () => {
    expect(getEstateWorkOrder(actor, 'WO-A')).toBe(orders[0]);
  });

  it('reads every page of the scoped property and work-order registers', () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({ ...orders[0], id: 'job-' + index, ref: 'WO-' + index }));
    boundary.sites.mockImplementation((_actor, { cursor }) => cursor === null ? { items: [sites[1]], cursor: 'next', total: 2 } : { items: [sites[0]], cursor: null, total: 2 });
    boundary.orders.mockImplementation((_actor, { cursor }) => cursor === null ? { items: rows.slice(0, 200), cursor: '200', total: 205 } : { items: rows.slice(200), cursor: null, total: 205 });
    expect(listEstateWorkOrders(actor)).toHaveLength(205);
    expect(boundary.sites).toHaveBeenCalledTimes(2);
    expect(boundary.orders).toHaveBeenCalledTimes(2);
  });

  it('only exposes form units attached to authorised Estate property/tenant pairs', () => {
    boundary.units.mockReturnValue({ items: [
      { id: 'unit-a', tenantId: 'tenant-a', siteId: 'estate-a' },
      { id: 'unit-b', tenantId: 'tenant-a', siteId: 'facility-a' },
      { id: 'unit-c', tenantId: 'tenant-b', siteId: 'estate-a' },
    ] as Unit[], cursor: null, total: 3 });
    expect(listEstateWorkOrderUnits(actor).map((unit) => unit.id)).toEqual(['unit-a']);
  });

  it('denies a role without work-order access before any register queries', () => {
    expect(() => listEstateWorkOrders({ ...actor, roles: ['security'] })).toThrow();
    expect(boundary.sites).not.toHaveBeenCalled();
    expect(boundary.orders).not.toHaveBeenCalled();
  });

  it('does not read properties for a mixed resident/security actor with only own-request access', () => {
    const ownOnly: Actor = { ...actor, roles: ['resident', 'security'], unitIds: ['unit-a'] };
    expect(listEstateWorkOrderSites(ownOnly)).toEqual([]);
    expect(boundary.sites).not.toHaveBeenCalled();
  });
});
