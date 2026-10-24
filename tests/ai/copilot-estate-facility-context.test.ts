import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/authz';
import { validCopilotSource } from '@/lib/ai/copilot-protocol';
import { collectCopilotRecords } from '@/server/ai/context/records';
import { buildEstateContext } from '@/server/ai/context/estate';
import { buildFacilityContext } from '@/server/ai/context/facility';

const fixture = vi.hoisted(() => ({ rows: {} as Record<string, Array<Record<string, unknown>>>, calls: [] as string[] }));
vi.mock('@/server/data', async () => {
  const { applyScope, assertCan } = await import('@/lib/authz');
  const capabilities = {
    sites: 'assets_ppm', units: 'assets_ppm', buildingSystems: 'assets_ppm', facilityAlarms: 'assets_ppm', facilityGenerators: 'assets_ppm', facilityParts: 'assets_ppm', facilityContracts: 'assets_ppm', facilityPermits: 'assets_ppm', facilityIncidents: 'assets_ppm', facilitySensors: 'assets_ppm', facilityMeters: 'assets_ppm', assets: 'assets_ppm', ppmPlans: 'assets_ppm', sustainabilityTargets: 'assets_ppm', emissionMonths: 'assets_ppm',
    invoices: 'charges_invoicing', collectionCases: 'charges_invoicing', workOrders: 'work_orders', vendors: 'work_orders', residents: 'users_roles', tenancies: 'users_roles', sosEvents: 'security_sos', announcements: 'announcements', complaints: 'announcements', documents: 'announcements', bookings: 'bookings_amenities', communityEvents: 'bookings_amenities', inspections: 'inspections_compliance', complianceObligations: 'inspections_compliance',
  } as const;
  return { repos: Object.fromEntries(Object.entries(capabilities).map(([name, capability]) => [name, { list: (actor: Actor, options: { cursor: string | null; limit: number }) => {
    fixture.calls.push(name);
    const scope = assertCan(actor, capability, 'read');
    const rows = (fixture.rows[name] ?? []).map((row) => name === 'sites' ? { ...row, siteId: row.id as string } : row);
    const scoped = applyScope(rows, scope);
    const start = Number(options.cursor ?? 0);
    const next = start + options.limit;
    return { items: scoped.slice(start, next), total: scoped.length, cursor: next < scoped.length ? String(next) : null };
  } }])) };
});

const manager: Actor = { userId: 'manager-a', tenantId: 'tenant-a', roles: ['estate_manager'], estateIds: ['estate-a'], allEstates: false, unitIds: [], vendorOrgId: null, investorProjectIds: [] };
const facilityManager: Actor = { ...manager, roles: ['facility_manager'] };
const site = (id: string, name: string, overrides: Record<string, unknown> = {}) => ({ id, tenantId: 'tenant-a', name, kind: 'estate', buildingCount: 1, unitCount: 2, ...overrides });
const invoice = (id: string, amount: number, currency = 'NGN', paid = 0, paidCurrency = currency) => ({ id, tenantId: 'tenant-a', estateId: 'estate-a', unitId: 'unit-a', residentName: 'Authorised resident', ref: id, description: 'Recorded service charge', status: 'overdue', amount: { minor: amount, currency }, paid: { minor: paid, currency: paidCurrency }, dueDate: '2026-07-20', agingDays: 6, ownerUserId: 'private-owner-id' });

beforeEach(() => {
  fixture.rows = { sites: [site('estate-a', 'Lagos Estate'), site('estate-b', 'Unassigned Estate'), site('estate-c', 'Foreign Tenant Estate', { tenantId: 'tenant-b' }), site('facility-a', 'Separate Facility', { kind: 'facility' })] };
  fixture.calls = [];
});

describe('bounded Copilot record collection', () => {
  it('reads successive pages and preserves complete native totals when the bound is sufficient', async () => {
    const rows = Array.from({ length: 75 }, (_, index) => ({ id: String(index), tenantId: 'tenant-a' }));
    const read = vi.fn(({ cursor, limit }: { cursor: string | null; limit: number }) => {
      const start = Number(cursor ?? 0); const next = start + limit;
      return { items: rows.slice(start, next), total: rows.length, cursor: next < rows.length ? String(next) : null };
    });
    const result = await collectCopilotRecords('records', read);
    expect(result.items).toHaveLength(75);
    expect(result.coverage).toEqual({ collection: 'records', loaded: 75, total: 75, complete: true });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('caps a large dataset and exposes a partial collection instead of an invented total', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({ id: String(index) }));
    const result = await collectCopilotRecords('records', ({ cursor, limit }) => { const start = Number(cursor ?? 0); return { items: rows.slice(start, start + limit), total: 250, cursor: String(start + limit) }; });
    expect(result.items).toHaveLength(100);
    expect(result.coverage).toEqual({ collection: 'records', loaded: 100, total: 250, complete: false });
  });

  it('deduplicates rows and terminates repeated cursors without claiming completeness', async () => {
    const read = vi.fn(() => ({ items: [{ id: 'same', tenantId: 'tenant-a' }], total: 4, cursor: 'again' }));
    const result = await collectCopilotRecords('loop', read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.coverage.complete).toBe(false);
  });

  it('keeps same record IDs in distinct tenants separate and discloses unknown filtered totals', async () => {
    const result = await collectCopilotRecords('filtered', () => ({ items: [{ id: 'same', tenantId: 'tenant-a' }, { id: 'same', tenantId: 'tenant-b' }], total: 9, cursor: 'next' }), { maxPages: 1, accept: () => true });
    expect(result.items).toHaveLength(2);
    expect(result.coverage).toEqual({ collection: 'filtered', loaded: 2, total: null, complete: false });
  });

  it('reports the true filtered subset only after exhausting its source', async () => {
    const result = await collectCopilotRecords('subset', () => ({ items: [{ id: 'keep' }, { id: 'remove' }], total: 2, cursor: null }), { accept: (row) => row.id === 'keep' });
    expect(result.coverage).toEqual({ collection: 'subset', loaded: 1, total: 1, complete: true });
  });
});

describe('Estate conversational context', () => {
  it('preserves tenant and assigned Estate boundaries before joining related records', async () => {
    fixture.rows.units = [{ id: 'unit-a', tenantId: 'tenant-a', siteId: 'estate-a', label: 'A1', type: 'Apartment', occupancy: 'occupied' }, { id: 'unit-b', tenantId: 'tenant-a', siteId: 'estate-b', label: 'Private other unit', occupancy: 'vacant' }];
    fixture.rows.invoices = [invoice('own-invoice', 12345), { ...invoice('foreign-invoice', 99999), tenantId: 'tenant-b' }, { ...invoice('other-estate-invoice', 99999), estateId: 'estate-b' }];
    const context = await buildEstateContext(manager);
    const json = JSON.stringify(context);
    expect(json).toContain('Lagos Estate'); expect(json).toContain('own-invoice');
    for (const secret of ['Foreign Tenant Estate', 'Unassigned Estate', 'Separate Facility', 'foreign-invoice', 'other-estate-invoice', 'Private other unit']) expect(json).not.toContain(secret);
    expect(context.facts.unitOccupancy).toEqual({ basis: 'Loaded unit occupancy fields; resident headcount is not occupancy', counts: { occupied: 1 } });
  });

  it('excludes Facility-site records even for tenant-wide reporting identities', async () => {
    fixture.rows.workOrders = [{ id: 'estate-job', tenantId: 'tenant-a', siteId: 'estate-a', estateId: 'estate-a', ref: 'ESTATE-1', title: 'Estate repair' }, { id: 'facility-job', tenantId: 'tenant-a', siteId: 'facility-a', estateId: 'facility-a', ref: 'FACILITY-PRIVATE', title: 'Facility-only job' }, { id: 'inconsistent-site', tenantId: 'tenant-a', siteId: 'facility-a', estateId: 'estate-a', ref: 'FACILITY-MIRROR-PRIVATE', title: 'Facility job with inconsistent scope mirror' }];
    const context = await buildEstateContext({ ...manager, allEstates: true });
    expect(JSON.stringify(context)).toContain('ESTATE-1');
    expect(JSON.stringify(context)).not.toContain('FACILITY-PRIVATE');
    expect(JSON.stringify(context)).not.toContain('FACILITY-MIRROR-PRIVATE');
    expect(context.sources.find((source) => source.id === 'estate-work-orders')?.href).toBe('/estate/work-orders');
  });

  it('omits denied datasets and resident monetary fields rather than presenting them as zero', async () => {
    fixture.rows.residents = [{ id: 'resident-a', tenantId: 'tenant-a', siteId: 'estate-a', name: 'Resident A', unitId: 'unit-a', balance: { minor: 999999, currency: 'NGN' }, status: 'active', household: 2, moveInDate: '2026-01-01' }];
    const context = await buildEstateContext(facilityManager);
    for (const collection of ['invoices', 'collectionCases', 'sosEvents', 'bookings', 'communityEvents']) expect(fixture.calls).not.toContain(collection);
    expect(context.facts).not.toHaveProperty('invoices'); expect(context.facts).not.toHaveProperty('sosEvents');
    expect(JSON.stringify(context)).not.toContain('999999');
    expect(context.notices.join(' ')).toContain('Billing and collections unavailable');
    expect(context.notices.join(' ')).toContain('Recorded SOS activity unavailable');
  });

  it('keeps exact kobo and native currency groups and excludes incompatible billed/paid currency pairs', async () => {
    fixture.rows.invoices = [invoice('ngn-a', 1000000000, 'NGN', 25), invoice('ngn-b', 12345, 'NGN', 20), invoice('usd', 501, 'USD', 100), invoice('mismatch', 900, 'NGN', 200, 'USD')];
    const context = await buildEstateContext(manager);
    expect(context.facts.invoiceTotals).toEqual({ basis: 'Loaded invoices, grouped by native currency; billed and paid currency must match', byCurrency: [{ currency: 'NGN', billedMinor: 1000012345, paidMinor: 45, outstandingMinor: 1000012300, invoices: 2 }, { currency: 'USD', billedMinor: 501, paidMinor: 100, outstandingMinor: 401, invoices: 1 }], excludedFromTotals: 1 });
  });

  it('projects fields explicitly, dropping contacts, authentication ownership, extracted private data and untagged amounts', async () => {
    fixture.rows.residents = [{ id: 'r1', tenantId: 'tenant-a', siteId: 'estate-a', name: 'Resident A', unitId: 'unit-a', balance: { minor: 25, currency: 'NGN' }, email: 'secret@example.test', phone: '08012345678', userId: 'secret-user-id' }];
    fixture.rows.tenancies = [{ id: 't1', tenantId: 'tenant-a', estateId: 'estate-a', residentName: 'Resident A', rentMinor: 773311, depositMinor: 881122, depositStatus: 'held' }];
    fixture.rows.collectionCases = [{ id: 'c1', tenantId: 'tenant-a', estateId: 'estate-a', invoiceRef: 'INV-1', amountMinor: 112233, promiseAmountMinor: 332211 }];
    fixture.rows.documents = [{ id: 'd1', tenantId: 'tenant-a', estateId: 'estate-a', name: 'Policy metadata', extracted: [{ label: 'ID number', value: 'PRIVATE-ID-11' }], uploadedBy: 'PRIVATE-UPLOADER' }];
    fixture.rows.sosEvents = [{ id: 's1', tenantId: 'tenant-a', estateId: 'estate-a', ref: 'SOS-1', ownerUserId: 'PRIVATE-OWNER', residentName: 'PRIVATE-SOS-PERSON', responder: 'PRIVATE-RESPONDER' }];
    const context = await buildEstateContext(manager); const json = JSON.stringify(context);
    for (const secret of ['secret@example.test', '08012345678', 'secret-user-id', '773311', '881122', '112233', '332211', 'PRIVATE-ID-11', 'PRIVATE-UPLOADER', 'PRIVATE-OWNER', 'PRIVATE-SOS-PERSON', 'PRIVATE-RESPONDER']) expect(json).not.toContain(secret);
    expect(json).toContain('Policy metadata'); expect(json).toContain('SOS-1');
  });

  it('marks site-dependent datasets incomplete if the bounded property list is incomplete', async () => {
    fixture.rows.sites = Array.from({ length: 101 }, (_, index) => site('estate-' + index, 'Property ' + index));
    const context = await buildEstateContext({ ...manager, allEstates: true });
    expect(context.coverage.find((coverage) => coverage.collection === 'Estate properties')).toEqual({ collection: 'Estate properties', loaded: 100, total: null, complete: false });
    expect(context.coverage.find((coverage) => coverage.collection === 'Estate invoices')).toEqual({ collection: 'Estate invoices', loaded: 0, total: null, complete: false });
  });

  it('uses actual snapshot dates and safe module-local source links without inferred emergency response', async () => {
    const context = await buildEstateContext(manager);
    expect(context.snapshotISO).toBe('2026-07-26T00:00:00.000Z');
    expect(context.sources.every((source) => validCopilotSource('estate', source))).toBe(true);
    expect(context.notices.join(' ')).toContain('not proof of attendance');
  });
});

describe('Facility conversational context', () => {
  it('provides raw permitted facts for arbitrary questions, not just a keyword answer or priority slice', async () => {
    fixture.rows.buildingSystems = [{ id: 'system-a', tenantId: 'tenant-a', siteId: 'estate-a', name: 'Recorded pump', category: 'water', status: 'standby', detail: 'Inspection awaiting review', lastCheckISO: '2026-07-25T09:00:00Z' }];
    fixture.rows.facilitySensors = [{ id: 'sensor-a', tenantId: 'tenant-a', siteId: 'estate-a', name: 'Water level', kind: 'water_tank', value: 45, unit: '%', low: 20, high: 90 }];
    const context = await buildFacilityContext(facilityManager);
    expect(context.facts.systems).toEqual([{ id: 'system-a', siteId: 'estate-a', name: 'Recorded pump', category: 'water', status: 'standby', detail: 'Inspection awaiting review', lastCheckISO: '2026-07-25T09:00:00Z' }]);
    expect(JSON.stringify(context.facts.sensors)).toContain('Water level');
    expect(context.facts).not.toHaveProperty('deterministicAnswer');
  });

  it('applies tenant and site scope while distinguishing tenant-only inventory', async () => {
    fixture.rows.facilityAlarms = [{ id: 'a1', tenantId: 'tenant-a', siteId: 'estate-a', system: 'Scoped alarm' }, { id: 'a2', tenantId: 'tenant-a', siteId: 'estate-b', system: 'OTHER-ESTATE-ALARM' }, { id: 'a3', tenantId: 'tenant-b', siteId: 'estate-a', system: 'FOREIGN-ALARM' }];
    fixture.rows.facilityParts = [{ id: 'p1', tenantId: 'tenant-a', name: 'Tenant stock', stock: 4, unitCost: { minor: 25, currency: 'NGN' } }, { id: 'p2', tenantId: 'tenant-b', name: 'FOREIGN-STOCK', unitCost: { minor: 25, currency: 'NGN' } }];
    const context = await buildFacilityContext(facilityManager); const json = JSON.stringify(context);
    expect(json).toContain('Scoped alarm'); expect(json).toContain('Tenant stock');
    for (const text of ['OTHER-ESTATE-ALARM', 'FOREIGN-ALARM', 'FOREIGN-STOCK']) expect(json).not.toContain(text);
    expect(context.notices.join(' ')).toContain('no site membership field');
  });

  it('preserves contract and inventory currency tags and labels fuel calculations as assumptions', async () => {
    fixture.rows.facilityContracts = [{ id: 'c1', tenantId: 'tenant-a', siteId: 'estate-a', service: 'Lift maintenance', value: { minor: 12345, currency: 'USD' } }];
    fixture.rows.facilityGenerators = [{ id: 'g1', tenantId: 'tenant-a', siteId: 'estate-a', name: 'Genset', runtimeHoursMonth: 10, litresPerHour: 3 }];
    const context = await buildFacilityContext(facilityManager);
    expect(JSON.stringify(context.facts.contracts)).toContain('"value":{"minor":12345,"currency":"USD"}');
    expect(context.facts.modelledGeneratorMonth).toMatchObject({ litres: 30, estimatedDieselCost: { minor: 3900000, currency: 'NGN' }, estimatedKgCo2: 80, assumedKgCo2PerLitre: 2.68 });
    expect(context.notices.join(' ')).toContain('not supplier quotes');
  });

  it('does not read or expose visitor codes, identity evidence, raw photos, assignee identities or permit requesters', async () => {
    fixture.rows.assets = [{ id: 'asset-a', tenantId: 'tenant-a', siteId: 'estate-a', name: 'Asset A', serial: 'PRIVATE-SERIAL', photos: [{ url: 'PRIVATE-PHOTO' }], createdBy: 'PRIVATE-CREATOR' }];
    fixture.rows.facilityPermits = [{ id: 'permit-a', tenantId: 'tenant-a', siteId: 'estate-a', ref: 'PTW-1', requestedBy: 'PRIVATE-REQUESTER', note: 'PRIVATE-NOTE' }];
    fixture.rows.workOrders = [{ id: 'wo-a', tenantId: 'tenant-a', siteId: 'estate-a', ref: 'WO-1', requesterName: 'PRIVATE-REQUEST-NAME', assigneeName: 'PRIVATE-ASSIGNEE', cost: { minor: 998877, currency: 'NGN' }, description: 'PRIVATE-DESCRIPTION' }];
    const context = await buildFacilityContext(facilityManager); const json = JSON.stringify(context);
    for (const text of ['PRIVATE-SERIAL', 'PRIVATE-PHOTO', 'PRIVATE-CREATOR', 'PRIVATE-REQUESTER', 'PRIVATE-NOTE', 'PRIVATE-REQUEST-NAME', 'PRIVATE-ASSIGNEE', '998877', 'PRIVATE-DESCRIPTION']) expect(json).not.toContain(text);
    for (const name of ['visitorPasses', 'accessEvents', 'accessPoints', 'residents', 'invoices']) expect(fixture.calls).not.toContain(name);
    expect(json).toContain('PTW-1'); expect(json).toContain('WO-1');
  });

  it('keeps technician ownership restrictions on work orders and inspections', async () => {
    fixture.rows.workOrders = [{ id: 'w1', tenantId: 'tenant-a', siteId: 'estate-a', assigneeUserId: 'manager-a', ref: 'ASSIGNED-TO-ME' }, { id: 'w2', tenantId: 'tenant-a', siteId: 'estate-a', assigneeUserId: 'other-tech', ref: 'PRIVATE-OTHER-JOB' }];
    fixture.rows.inspections = [{ id: 'i1', tenantId: 'tenant-a', siteId: 'estate-a', assigneeUserId: 'other-tech', ref: 'PRIVATE-OTHER-INSPECTION', raisedWorkOrderRefs: [] }];
    const context = await buildFacilityContext({ ...manager, roles: ['technician'] }); const json = JSON.stringify(context);
    expect(json).toContain('ASSIGNED-TO-ME'); expect(json).not.toContain('PRIVATE-OTHER-JOB'); expect(json).not.toContain('PRIVATE-OTHER-INSPECTION');
  });

  it('bounds each collection, discloses remaining records and validates source paths', async () => {
    fixture.rows.facilityAlarms = Array.from({ length: 101 }, (_, index) => ({ id: String(index), tenantId: 'tenant-a', siteId: 'estate-a', system: 'Alarm ' + index }));
    const context = await buildFacilityContext(facilityManager);
    expect(context.coverage.find((coverage) => coverage.collection === 'Facility alarms')).toEqual({ collection: 'Facility alarms', loaded: 100, total: 101, complete: false });
    expect(context.notices.join(' ')).toContain('An unlisted alarm');
    expect(context.sources.every((source) => validCopilotSource('facility', source))).toBe(true);
  });
});

describe('module context entry boundaries', () => {
  it.each([null, ''])('rejects missing tenant %s without loading any records', async (tenantId) => {
    await expect(buildEstateContext({ ...manager, tenantId })).rejects.toThrow();
    await expect(buildFacilityContext({ ...manager, tenantId })).rejects.toThrow();
    expect(fixture.calls).toHaveLength(0);
  });
  it('rejects cross-tenant platform identities and non-operator roles', async () => {
    for (const roles of [['platform_admin'], ['resident'], ['investor']] as const) {
      const actor = { ...manager, roles, investorProjectIds: ['project-a'], unitIds: ['unit-a'] };
      await expect(buildEstateContext(actor)).rejects.toThrow();
      await expect(buildFacilityContext(actor)).rejects.toThrow();
    }
    expect(fixture.calls).toHaveLength(0);
  });
});
