import { describe, expect, it } from 'vitest';
import { buildEstateOverview, type EstateOverviewInput } from '@/domain/estate/overview';
import type { Invoice, Resident, Site, Unit, WorkOrder } from '@/domain/entities';
import { asId } from '@/domain/ids';
import { money } from '@/domain/primitives';
import { WORK_ORDER_STATES } from '@/domain/enums';

const tenantId = asId<Site['tenantId']>('tenant-a');
const estateId = asId<Site['id']>('estate-a');
const userId = asId<Resident['userId']>('resident-a');
const unitId = asId<Unit['id']>('unit-a');

function site(overrides: Partial<Site> = {}): Site {
  return { id: estateId, tenantId, kind: 'estate', name: 'Lekki Gardens', address: 'Lagos', buildingCount: 8, unitCount: 900, ...overrides };
}
function unit(overrides: Partial<Unit> = {}): Unit {
  return { id: unitId, tenantId, siteId: estateId, buildingId: asId<Unit['buildingId']>('block-a'), label: 'A1', type: 'Apartment', occupancy: 'occupied', ...overrides };
}
function resident(overrides: Partial<Resident> = {}): Resident {
  return { id: asId<Resident['id']>('resident-row-a'), tenantId, userId, name: 'Ada', unitId, siteId: estateId, status: 'active', household: 2, balance: money(9_000), moveInDate: '2025-01-01', ...overrides };
}
function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return { id: asId<Invoice['id']>('invoice-a'), tenantId, ref: 'INV-001', unitId, estateId, residentName: 'Ada', ownerUserId: userId, description: 'Service charge', status: 'issued', amount: money(10_000), paid: money(4_000), dueDate: '2026-10-10', agingDays: -200, ...overrides };
}
function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return { id: asId<WorkOrder['id']>('wo-a'), tenantId, ref: 'WO-001', title: 'Plumbing repair', siteId: estateId, estateId, status: 'new', priority: 'routine', origin: 'manager', requesterUserId: userId, requesterName: 'Ada', assigneeName: 'Bola', respondDueAt: null, resolveDueAt: null, cost: null, createdAt: '2026-10-01T10:00:00Z', createdBy: userId, updatedAt: '2026-10-01T10:00:00Z', updatedBy: userId, ...overrides };
}
function input(overrides: Partial<EstateOverviewInput> = {}): EstateOverviewInput {
  return { sites: [site()], units: [unit()], residents: [resident()], invoices: [invoice()], workOrders: [], currency: 'NGN', now: '2026-10-23T18:00:00Z', ...overrides };
}

describe('buildEstateOverview', () => {
  it('counts only estate properties and enumerated unit records, not site estimates', () => {
    const facility = site({ id: asId<Site['id']>('facility-a'), kind: 'facility' });
    const result = buildEstateOverview(input({ sites: [site(), facility], units: [unit(), unit({ id: asId<Unit['id']>('vacant'), occupancy: 'vacant' }), unit({ id: asId<Unit['id']>('reserved'), occupancy: 'reserved' }), unit({ id: asId<Unit['id']>('facility-unit'), siteId: facility.id })] }));
    expect(result.propertiesCount).toBe(1);
    expect(result.units).toEqual({ total: 3, occupied: 1, vacant: 1, reserved: 1, unavailable: 0, occupancyPct: 33 });
    expect(result.propertyPerformance[0]).toMatchObject({ unitCount: 3, occupiedUnits: 1, occupancyPct: 33 });
  });

  it('keeps unavailable units in the occupancy denominator without calling them vacant', () => {
    const result = buildEstateOverview(input({ units: [unit(), unit({ id: asId<Unit['id']>('offline-unit'), occupancy: 'unavailable' })] }));
    expect(result.units).toEqual({ total: 2, occupied: 1, vacant: 0, reserved: 0, unavailable: 1, occupancyPct: 50 });
  });

  it('does not attach another tenant records that reuse the same estate ID', () => {
    const anotherTenant = asId<Site['tenantId']>('tenant-b');
    const result = buildEstateOverview(input({ units: [unit(), unit({ id: asId<Unit['id']>('foreign'), tenantId: anotherTenant })], invoices: [invoice(), invoice({ id: asId<Invoice['id']>('foreign'), tenantId: anotherTenant, amount: money(999_999) })], residents: [resident(), resident({ tenantId: anotherTenant, userId: asId<Resident['userId']>('foreign') })], workOrders: [workOrder({ tenantId: anotherTenant })] }));
    expect(result.units.total).toBe(1);
    expect(result.residents.activeCount).toBe(1);
    expect(result.collections.billedMinor).toBe(10_000);
    expect(result.maintenance.total).toBe(0);
  });

  it('counts active residents by distinct user, excluding invited and moved-out people', () => {
    const result = buildEstateOverview(input({ residents: [resident(), resident({ id: asId<Resident['id']>('second-unit'), unitId: asId<Unit['id']>('second') }), resident({ id: asId<Resident['id']>('moved'), userId: asId<Resident['userId']>('moved'), status: 'moved_out' }), resident({ id: asId<Resident['id']>('invite'), userId: asId<Resident['userId']>('invite'), status: 'invited' })] }));
    expect(result.residents.activeCount).toBe(1);
  });

  it('counts unique active overdue residents from balances and due dates, not agingDays', () => {
    const movedOut = asId<Resident['userId']>('moved-out');
    const result = buildEstateOverview(input({ residents: [resident(), resident({ id: asId<Resident['id']>('moved'), userId: movedOut, status: 'moved_out' })], invoices: [invoice(), invoice({ id: asId<Invoice['id']>('also-overdue') }), invoice({ id: asId<Invoice['id']>('paid'), paid: money(10_000) }), invoice({ id: asId<Invoice['id']>('former'), ownerUserId: movedOut }), invoice({ id: asId<Invoice['id']>('future'), ownerUserId: asId<Resident['userId']>('other'), dueDate: '2026-11-01', agingDays: 100 })] }));
    expect(result.residents.overdueCount).toBe(1);
  });

  it('clamps applied payments and excludes draft or mismatched currency invoices', () => {
    const result = buildEstateOverview(input({ invoices: [invoice({ paid: money(-50) }), invoice({ id: asId<Invoice['id']>('overpaid'), paid: money(50_000) }), invoice({ id: asId<Invoice['id']>('draft'), status: 'draft', amount: money(90_000) }), invoice({ id: asId<Invoice['id']>('usd'), amount: money(30_000, 'USD'), paid: money(3_000, 'USD') }), invoice({ id: asId<Invoice['id']>('mixed'), paid: money(7_000, 'USD') })] }));
    expect(result.collections).toEqual({ billedMinor: 20_000, collectedMinor: 10_000, outstandingMinor: 10_000, collectionRatePct: 50, invoiceCount: 2, settledInvoices: 1, settledInvoicePct: 50 });
  });

  it('honours the configured currency rather than assuming NGN', () => {
    const result = buildEstateOverview(input({ currency: 'GHS', invoices: [invoice(), invoice({ id: asId<Invoice['id']>('ghs'), amount: money(500, 'GHS'), paid: money(100, 'GHS') })] }));
    expect(result.currency).toBe('GHS');
    expect(result.collections).toMatchObject({ billedMinor: 500, collectedMinor: 100, outstandingMinor: 400, invoiceCount: 1 });
  });

  it('groups six due-month snapshots across year boundaries without inventing payment dates', () => {
    const result = buildEstateOverview(input({ now: '2027-02-15T08:00:00Z', invoices: [invoice({ id: asId<Invoice['id']>('sept'), dueDate: '2026-09-30' }), invoice({ id: asId<Invoice['id']>('feb'), dueDate: '2027-02-01', paid: money(10_000) }), invoice({ id: asId<Invoice['id']>('too-old'), dueDate: '2026-08-31' }), invoice({ id: asId<Invoice['id']>('future'), dueDate: '2027-03-01' })] }));
    expect(result.collectionTrend.map((month) => month.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
    expect(result.collectionTrend[0]).toMatchObject({ billedMinor: 10_000, collectedMinor: 4_000 });
    expect(result.collectionTrend[1]).toMatchObject({ billedMinor: 0, collectedMinor: 0 });
    expect(result.collectionTrend[5]).toMatchObject({ billedMinor: 10_000, collectedMinor: 10_000 });
    expect(result.collections.invoiceCount).toBe(4);
  });

  it('does not chart future-due rows beyond the as-of day, while retaining issued snapshot balances', () => {
    const result = buildEstateOverview(input({ invoices: [invoice({ dueDate: '2026-10-24' })] }));
    expect(result.collectionTrend[5].billedMinor).toBe(0);
    expect(result.collections.billedMinor).toBe(10_000);
    expect(result.paymentsDue[0]).toMatchObject({ daysUntilDue: 1, overdue: false });
  });

  it('uses the Lagos calendar date when a UTC timestamp crosses midnight locally', () => {
    const result = buildEstateOverview(input({ now: '2026-10-31T23:30:00Z', invoices: [invoice({ dueDate: '2026-11-01' })] }));
    expect(result.asOfLagosDate).toBe('2026-11-01');
    expect(result.collectionTrend[5].month).toBe('2026-11');
    expect(result.paymentsDue[0]).toMatchObject({ daysUntilDue: 0, overdue: false });
  });

  it('accepts explicit timezone offsets and date-only as-of values consistently', () => {
    const base = input({ invoices: [invoice({ dueDate: '2026-10-24' })] });
    const withOffset = buildEstateOverview({ ...base, now: '2026-10-24T00:30:00+01:00' });
    const dateOnly = buildEstateOverview({ ...base, now: '2026-10-24' });
    expect(withOffset.asOfLagosDate).toBe(dateOnly.asOfLagosDate);
    expect(withOffset.paymentsDue).toEqual(dateOnly.paymentsDue);
  });

  it('sorts overdue oldest first, then due today/upcoming through day 30 inclusively', () => {
    const dueDates = ['2026-11-23', '2026-11-22', '2026-10-24', '2026-10-23', '2026-10-01', '2026-09-01'];
    const result = buildEstateOverview(input({ invoices: dueDates.map((dueDate, index) => invoice({ id: asId<Invoice['id']>(`i${index}`), ref: `INV-${index}`, dueDate })) }));
    expect(result.paymentsDue.map((row) => row.dueDate)).toEqual(['2026-09-01', '2026-10-01', '2026-10-23', '2026-10-24', '2026-11-22']);
    expect(result.paymentsDue.map((row) => row.daysUntilDue)).toEqual([-52, -22, 0, 1, 30]);
    expect(result.paymentsDue.map((row) => row.overdue)).toEqual([true, true, false, false, false]);
  });

  it('does not include fully settled invoices in payments due or overdue people', () => {
    const result = buildEstateOverview(input({ invoices: [invoice({ paid: money(10_000), status: 'paid' })] }));
    expect(result.paymentsDue).toEqual([]);
    expect(result.residents.overdueCount).toBe(0);
    expect(result.collections.settledInvoicePct).toBe(100);
  });

  it.each(['', 'not-a-date', '2026-02-30', '2026-13-01', '2026-10-23T10:00:00', '2026-10-23T25:00:00Z'])('keeps malformed due dates out of date-based metrics: %s', (dueDate) => {
    const result = buildEstateOverview(input({ invoices: [invoice({ dueDate })] }));
    expect(result.paymentsDue).toEqual([]);
    expect(result.collectionTrend.every((month) => month.billedMinor === 0)).toBe(true);
    expect(result.residents.overdueCount).toBe(0);
    expect(result.collections.billedMinor).toBe(10_000);
  });

  it('handles leap-year calendar boundaries without normalising invalid dates', () => {
    const result = buildEstateOverview(input({ now: '2028-03-01', invoices: [invoice({ dueDate: '2028-02-29' }), invoice({ id: asId<Invoice['id']>('invalid'), dueDate: '2027-02-29' })] }));
    expect(result.paymentsDue).toHaveLength(1);
    expect(result.paymentsDue[0].daysUntilDue).toBe(-1);
  });

  it('returns unavailable date-based data for an invalid clock without discarding ledger balances', () => {
    const result = buildEstateOverview(input({ now: 'invalid' }));
    expect(result.asOfLagosDate).toBeNull();
    expect(result.collectionTrend).toEqual([]);
    expect(result.paymentsDue).toEqual([]);
    expect(result.collections.outstandingMinor).toBe(6_000);
  });

  it('groups performance by both estate and tenant with no facility/unjoined balance leakage', () => {
    const secondEstate = site({ id: asId<Site['id']>('estate-b'), name: 'Abuja Heights' });
    const result = buildEstateOverview(input({ sites: [site(), secondEstate], units: [unit(), unit({ id: asId<Unit['id']>('b-unit'), siteId: secondEstate.id, occupancy: 'vacant' })], invoices: [invoice(), invoice({ id: asId<Invoice['id']>('estate-b'), estateId: secondEstate.id, amount: money(80_000), paid: money(20_000) }), invoice({ id: asId<Invoice['id']>('unknown'), estateId: asId<Site['id']>('unknown-estate'), amount: money(999_999) })] }));
    expect(result.propertyPerformance[0]).toMatchObject({ id: 'estate-a', unitCount: 1, occupiedUnits: 1, billedMinor: 10_000, collectedMinor: 4_000 });
    expect(result.propertyPerformance[1]).toMatchObject({ id: 'estate-b', unitCount: 1, occupiedUnits: 0, billedMinor: 80_000, collectedMinor: 20_000 });
    expect(result.collections.billedMinor).toBe(90_000);
  });

  it('maps every work-order status into the truthful four maintenance groups', () => {
    const result = buildEstateOverview(input({ workOrders: WORK_ORDER_STATES.map((status) => workOrder({ id: asId<WorkOrder['id']>(status), status })) }));
    expect(result.maintenance).toEqual({ total: 8, open: 3, inProgress: 2, awaitingConfirmation: 1, resolved: 2, cancelled: 1, rejected: 1, resolutionRatePct: 25, averageResolutionHours: null });
  });

  it('does not call all work resolved when only cancellations or pending confirmations exist', () => {
    const result = buildEstateOverview(input({ workOrders: [workOrder({ status: 'cancelled' }), workOrder({ id: asId<WorkOrder['id']>('pending'), status: 'resolved' })] }));
    expect(result.maintenance).toMatchObject({ total: 1, cancelled: 1, awaitingConfirmation: 1, resolved: 0, resolutionRatePct: 0, averageResolutionHours: null });
  });

  it('uses null percentages rather than fake zero/100 rates for empty datasets', () => {
    const result = buildEstateOverview(input({ sites: [], units: [], residents: [], invoices: [], workOrders: [] }));
    expect(result.propertiesCount).toBe(0);
    expect(result.units.occupancyPct).toBeNull();
    expect(result.collections).toMatchObject({ invoiceCount: 0, billedMinor: 0, collectedMinor: 0, outstandingMinor: 0, collectionRatePct: null, settledInvoicePct: null });
    expect(result.maintenance.resolutionRatePct).toBeNull();
    expect(result.propertyPerformance).toEqual([]);
    expect(result.collectionTrend).toHaveLength(6);
  });

  it('excludes malformed monetary values but safely clamps negative payments', () => {
    const result = buildEstateOverview(input({ invoices: [invoice({ amount: money(-100) }), invoice({ id: asId<Invoice['id']>('nan'), paid: { minor: Number.NaN, currency: 'NGN' } }), invoice({ id: asId<Invoice['id']>('valid'), paid: money(-100) })] }));
    expect(result.collections).toMatchObject({ invoiceCount: 1, billedMinor: 10_000, collectedMinor: 0, outstandingMinor: 10_000 });
  });

  it('deduplicates repeated records and never mutates the input arrays or records', () => {
    const data = input({ sites: [site(), site()], units: [unit(), unit()], invoices: [invoice(), invoice()], workOrders: [workOrder(), workOrder()] });
    const before = JSON.stringify(data);
    Object.freeze(data.sites); Object.freeze(data.units); Object.freeze(data.residents); Object.freeze(data.invoices); Object.freeze(data.workOrders);
    for (const record of [...data.sites, ...data.units, ...data.residents, ...data.invoices, ...data.workOrders]) Object.freeze(record);
    const result = buildEstateOverview(data);
    expect(result.propertiesCount).toBe(1);
    expect(result.units.total).toBe(1);
    expect(result.collections.invoiceCount).toBe(1);
    expect(result.maintenance.total).toBe(1);
    expect(JSON.stringify(data)).toBe(before);
  });
});
