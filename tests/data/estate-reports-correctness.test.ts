import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Invoice, SosEvent, WorkOrder } from '@/domain/entities';
import type { CurrencyCode } from '@/domain/primitives';
import type { Dataset } from '@/domain/reports';
import { NOW_MS } from '@/domain/ppm';
import { identityByKey } from '@/server/identities';

const boundary = vi.hoisted(() => ({ actor: vi.fn(), guard: vi.fn(), estate: vi.fn(), generic: vi.fn(), invoices: vi.fn(), sos: vi.fn(), vendors: vi.fn(), residents: vi.fn(), sites: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('@/server/guard', () => ({ requireCapability: boundary.guard }));
vi.mock('@/server/reads/estate-work-orders', () => ({ listEstateWorkOrders: boundary.estate }));
vi.mock('@/server/data', () => ({ repos: { workOrders: { list: boundary.generic }, invoices: { list: boundary.invoices }, sosEvents: { list: boundary.sos }, vendors: { list: boundary.vendors }, residents: { list: boundary.residents }, sites: { all: boundary.sites } }, seed: { sites: [{ id: 'estate-a', name: 'Estate A' }] } }));

import { askData } from '@/server/actions/ask-data';
import ReportsPage from '@/app/(ops)/(estate)/reports/page';

function actAs(key = 'estate_manager') {
  const actor = identityByKey(key).actor;
  boundary.actor.mockResolvedValue(actor);
  boundary.guard.mockResolvedValue({ actor });
  return actor;
}
function invoice(currency: CurrencyCode = 'NGN', amount = 100_025, paid = 50_001, extra: Omit<Partial<Invoice>, 'id'> & { id?: string } = {}): Invoice {
  return { tenantId: 'tenant-a', id: 'invoice-a', ref: 'INV-01', unitId: 'unit-a', estateId: 'estate-a', residentName: 'Ada Okafor', ownerUserId: 'resident-a', description: 'Service charge', status: 'in_arrears', amount: { minor: amount, currency }, paid: { minor: paid, currency }, dueDate: '2026-01-01', agingDays: 60, ...extra } as Invoice;
}
function workOrder(extra: Omit<Partial<WorkOrder>, 'id'> & { id?: string } = {}): WorkOrder {
  return { tenantId: 'tenant-a', id: 'wo-estate', ref: 'WO-ESTATE', estateId: 'estate-a', siteId: 'estate-a', status: 'new', origin: 'manager', respondDueAt: null, resolveDueAt: null, cost: null, ...extra } as WorkOrder;
}
function metricsDataset(page: ReactElement<{ children: ReactElement[] }>): Dataset {
  const tabs = page.props.children.find((child) => (child?.props as { label?: string })?.label === 'Reports and analytics sections') as ReactElement<{ items: { content: ReactElement<{ dataset: Dataset }> }[] }>;
  return tabs.props.items[0].content.props.dataset;
}

beforeEach(() => {
  vi.clearAllMocks();
  actAs();
  boundary.estate.mockReturnValue([workOrder()]);
  boundary.generic.mockImplementation(() => { throw new Error('Generic Facility / Estate work-order reads are not permitted here.'); });
  boundary.invoices.mockReturnValue({ items: [], total: 0, cursor: null });
  boundary.sos.mockReturnValue({ items: [], total: 0, cursor: null });
  boundary.vendors.mockReturnValue({ items: [], total: 0, cursor: null });
  boundary.residents.mockReturnValue({ items: [], total: 0, cursor: null });
  boundary.sites.mockReturnValue([]);
});

describe('Estate report work-order boundary', () => {
  it('builds the metrics dataset from the shared Estate-only scoped read, not the generic register', async () => {
    const actor = actAs('executive');
    const rows = [workOrder(), workOrder({ id: 'wo-second', origin: 'ppm_schedule' })];
    boundary.estate.mockReturnValue(rows);
    const dataset = metricsDataset(await ReportsPage() as ReactElement<{ children: ReactElement[] }>);
    expect(dataset.workOrders).toBe(rows);
    expect(boundary.estate).toHaveBeenCalledWith(actor);
    expect(boundary.generic).not.toHaveBeenCalled();
  });

  it('does not invoke the Estate work-order read when its capability is unavailable', async () => {
    actAs('security');
    const dataset = metricsDataset(await ReportsPage() as ReactElement<{ children: ReactElement[] }>);
    expect(dataset.workOrders).toEqual([]);
    expect(boundary.estate).not.toHaveBeenCalled();
    expect(boundary.generic).not.toHaveBeenCalled();
  });

  it.each(['open work orders', 'overdue maintenance', 'preventive maintenance'])('uses Estate-scoped evidence for %s', async (question) => {
    const actor = actAs('executive');
    const answer = await askData(question);
    expect(boundary.estate).toHaveBeenCalledWith(actor);
    expect(boundary.generic).not.toHaveBeenCalled();
    expect(answer.sources).toEqual([{ label: expect.any(String), href: '/estate/work-orders' }]);
  });

  it.each(['open work orders', 'overdue maintenance', 'preventive maintenance'])('returns an access explanation rather than a false zero for %s without permission', async (question) => {
    actAs('security');
    const answer = await askData(question);
    expect(answer.answer).toContain('doesn’t have access to work-order data');
    expect(answer.metric).toBeUndefined();
    expect(answer.sources).toEqual([]);
    expect(boundary.estate).not.toHaveBeenCalled();
  });

  it('does not call an unconfigured or invalid response due date an SLA breach', async () => {
    boundary.estate.mockReturnValue([workOrder(), workOrder({ id: 'invalid', respondDueAt: 'invalid' }), workOrder({ id: 'future', respondDueAt: new Date(NOW_MS + 1000).toISOString() }), workOrder({ id: 'overdue', respondDueAt: new Date(NOW_MS - 1000).toISOString() })]);
    const answer = await askData('overdue work orders');
    expect(answer.metric).toBe('1');
    expect(answer.detail).toEqual(['Estate A: 1 breaching']);
  });
});

describe('Native-currency reporting answers', () => {
  it('preserves exact kobo for recorded collection and arrears amounts', async () => {
    boundary.invoices.mockReturnValue({ items: [invoice()], total: 1, cursor: null });
    const collection = await askData('collection rate');
    expect(collection.answer).toContain('₦500.01 recorded paid of ₦1,000.25 billed (NGN)');
    expect(collection.answer).toContain('not independently verified bank settlements');
    const arrears = await askData('who is in arrears');
    expect(arrears.metric).toBe('₦500.24');
    expect(arrears.detail?.[0]).toContain('₦500.24');
    expect(arrears.answer).toContain('1 invoice is marked in arrears');
  });

  it.each(['USD', 'GHS', 'KES'] as CurrencyCode[])('reports %s natively without relabelling it as naira', async (currency) => {
    boundary.invoices.mockReturnValue({ items: [invoice(currency, 2001, 1001)], total: 1, cursor: null });
    const collection = await askData('collection rate');
    expect(collection.answer).toContain(`${currency} 10.01 recorded paid of ${currency} 20.01`);
    expect(collection.answer).not.toContain('₦');
    const arrears = await askData('arrears');
    expect(arrears.metric).toBe(`${currency} 10.00`);
    expect(arrears.answer).not.toContain('₦');
  });

  it.each(['collection rate', 'arrears'])('refuses to combine currencies for %s and retains the Billing evidence link', async (question) => {
    boundary.invoices.mockReturnValue({ items: [invoice('NGN'), invoice('USD', 4001, 1001, { id: 'invoice-usd' })], total: 2, cursor: null });
    const answer = await askData(question);
    expect(answer.matched).toBe(false);
    expect(answer.metric).toBeUndefined();
    expect(answer.detail).toBeUndefined();
    expect(answer.answer).toContain('mixed currencies or mismatched billed and paid currencies');
    expect(answer.answer).toContain('Open Billing and select a currency');
    expect(answer.sources).toEqual([{ label: 'Review Billing by currency', href: '/billing' }]);
  });

  it.each(['collection rate', 'arrears'])('rejects mismatched billed / paid money for %s even when the paid minor amount is zero', async (question) => {
    boundary.invoices.mockReturnValue({ items: [invoice('USD', 2001, 0, { paid: { minor: 0, currency: 'NGN' } })], total: 1, cursor: null });
    const answer = await askData(question);
    expect(answer.matched).toBe(false);
    expect(answer.metric).toBeUndefined();
    expect(answer.sources[0].href).toBe('/billing');
  });

  it('keeps sub-naira amounts and sums exact to two minor-unit digits', async () => {
    boundary.invoices.mockReturnValue({ items: [invoice('NGN', 50, 1), invoice('NGN', 25, 2, { id: 'invoice-b' })], total: 2, cursor: null });
    const answer = await askData('collection rate');
    expect(answer.answer).toContain('₦0.03 recorded paid of ₦0.75');
    expect((await askData('arrears')).metric).toBe('₦0.72');
  });

  it('preserves billing denial before returning amounts or a source link', async () => {
    actAs('facility_manager');
    const answer = await askData('collection rate');
    expect(answer.answer).toContain('doesn’t have access to billing data');
    expect(answer.metric).toBeUndefined();
    expect(answer.sources).toEqual([]);
    expect(boundary.invoices).not.toHaveBeenCalled();
  });
});

describe('Recorded SOS reporting claims', () => {
  it('does not present missing acknowledgement observations as a zero-second performance result', async () => {
    boundary.sos.mockReturnValue({ items: [{ id: 'sos-a', ref: 'SOS-A', residentName: 'Ada', status: 'raised', ackSeconds: null } as SosEvent], total: 1, cursor: null });
    const answer = await askData('SOS response times');
    expect(answer.answer).toContain('No acknowledgement times are recorded');
    expect(answer.answer).not.toContain('0s');
    expect(answer.answer).toContain('not verified emergency dispatch or SLA measurements');
    expect(answer.sources[0].href).toBe('/security');
  });

  it('labels seeded acknowledgement numbers as recorded demo observations, not verified SLA success', async () => {
    boundary.sos.mockReturnValue({ items: [{ id: 'sos-a', ref: 'SOS-A', residentName: 'Ada', status: 'acknowledged', ackSeconds: 42 } as SosEvent], total: 1, cursor: null });
    const answer = await askData('SOS response times');
    expect(answer.answer).toContain('Average recorded acknowledgement is 42s');
    expect(answer.answer).toContain('demonstration records');
    expect(answer.answer).toContain('not verified emergency dispatch or SLA measurements');
    expect(answer.answer).not.toMatch(/target met|SLA achieved|verified response/i);
  });
});
