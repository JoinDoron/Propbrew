import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SosConsole, SosTerminalDialog, sosNeedsConfirmation, sosElapsedSeconds, sosElapsedLabel, type SosView } from '@/components/security/sos-console';
import { ParcelsWorkspace, LogDialog, type ParcelRow } from '@/components/estate/parcels-workspace';
import { MarketplaceWorkspace, marketplaceMoney, type OrderView } from '@/components/marketplace/marketplace-workspace';
import type { Listing } from '@/domain/entities';
import { transition } from '@/server/actions/transitions';
import { logParcel, collectParcel, notifyResident } from '@/server/actions/estate';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/transitions', () => ({ transition: vi.fn() }));
vi.mock('@/server/actions/estate', () => ({ logParcel: vi.fn(), collectParcel: vi.fn(), notifyResident: vi.fn() }));

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const source = {
  security: () => read('src/components/security/sos-console.tsx'),
  parcels: () => read('src/components/estate/parcels-workspace.tsx'),
  marketplace: () => read('src/components/marketplace/marketplace-workspace.tsx'),
};
const nowMs = Date.parse('2026-10-23T09:00:00Z');
const events: SosView[] = [
  { id: 'sos-raised', ref: 'SOS-1041', residentName: 'Folake Bello', unitId: 'C-12B', estateId: 'estate-1', status: 'raised', ackSeconds: null, responder: null, channel: 'in_app', raisedAt: '2026-10-23T08:59:00Z', actions: ['ACKNOWLEDGE'] },
  { id: 'sos-acked', ref: 'SOS-1042', residentName: 'Ada Okafor', unitId: 'A-04', estateId: 'estate-1', status: 'acknowledged', ackSeconds: 42, responder: 'Gate team', channel: 'sms_fallback', raisedAt: '2026-10-23T08:58:00Z', actions: ['RESPOND'] },
  { id: 'sos-reviewed', ref: 'SOS-1043', residentName: 'Ngozi Adeniyi', unitId: 'D-08', estateId: 'estate-1', status: 'reviewed', ackSeconds: 60, responder: 'Backup team', channel: 'in_app', raisedAt: '2026-10-23T08:00:00Z', actions: [] },
];
const renderSecurity = (overrides: Partial<ComponentProps<typeof SosConsole>> = {}) => renderToStaticMarkup(createElement(SosConsole, { events, canMutate: true, ...overrides }));
const parcels: ParcelRow[] = [
  { id: 'parcel-1', code: 'PKG-001', residentName: 'Folake Bello', unitLabel: 'C-12B', courier: 'Jumia', size: 'M', status: 'stored', lockerLabel: 'A-01', receivedISO: '2026-10-20T09:00:00Z' },
  { id: 'parcel-2', code: 'PKG-002', residentName: 'Ada Okafor', unitLabel: 'A-04', courier: 'DHL', size: 'S', status: 'received', receivedISO: '2026-10-23T08:00:00Z' },
  { id: 'parcel-3', code: 'PKG-003', residentName: 'Ngozi Adeniyi', unitLabel: 'D-08', courier: 'GIG', size: 'L', status: 'collected', receivedISO: '2026-10-22T08:00:00Z' },
];
const parcelProps: ComponentProps<typeof ParcelsWorkspace> = {
  lockers: [{ id: 'locker-1', bank: 'Main gate', label: 'A-01', size: 'M', occupied: true }, { id: 'locker-2', bank: 'Main gate', label: 'A-02', size: 'S', occupied: false }],
  parcels, kpis: { inLocker: 1, awaiting: 1, overdue: 1, collectedToday: 1, util: { used: 1, total: 2, pct: 50 } }, nowMs, canCreate: true, canMutate: true,
};
const renderParcels = (overrides: Partial<ComponentProps<typeof ParcelsWorkspace>> = {}) => renderToStaticMarkup(createElement(ParcelsWorkspace, { ...parcelProps, ...overrides }));
const orders: OrderView[] = [
  { id: 'order-1', ref: 'ORD-001', residentName: 'Folake Bello', listingTitle: 'Home cleaning', vendorName: 'Clean Lagos', status: 'placed', amountMinor: 1_200_025, currency: 'NGN', actions: [{ event: 'ACCEPT', label: 'Accept', variant: 'primary' }] },
  { id: 'order-2', ref: 'ORD-002', residentName: 'Ada Okafor', listingTitle: 'Laundry service', vendorName: 'Clean Lagos', status: 'closed', amountMinor: 2_000_050, currency: 'NGN', actions: [] },
  { id: 'order-3', ref: 'ORD-003', residentName: 'Ngozi Adeniyi', listingTitle: 'Garden care', vendorName: 'Green Abuja', status: 'refunded', amountMinor: 5_000, currency: 'NGN', actions: [] },
];
const listings = [
  { id: 'listing-1', tenantId: 'tenant-1', vendorOrgId: 'vendor-1', vendorName: 'Clean Lagos', title: 'Home cleaning', category: 'Cleaning', price: { minor: 1_200_025, currency: 'NGN' }, status: 'active', estateId: 'estate-1' },
  { id: 'listing-2', tenantId: 'tenant-1', vendorOrgId: 'vendor-2', vendorName: 'Green Abuja', title: 'Garden care', category: 'Gardening', price: { minor: 5_000, currency: 'NGN' }, status: 'paused', estateId: 'estate-1' },
] as unknown as Listing[];
const marketProps: ComponentProps<typeof MarketplaceWorkspace> = {
  orders, listings, gmv: { grossMinor: 3_200_075, realizedMinor: 2_000_050, pendingMinor: 1_200_025, voidMinor: 5_000, orders: 3, realizedRate: 50 },
  vendors: [{ vendorOrgId: 'vendor-1', vendorName: 'Clean Lagos', orders: 2, acceptedRate: 100, fulfilledRate: 50, gmvMinor: 3_200_075, activeListings: 1, pausedListings: 0, rating: 78, tone: 'success' }],
  flags: [{ orderId: 'order-1', ref: 'ORD-001', residentName: 'Folake Bello', amountMinor: 1_200_025, severity: 'watch', reason: 'Two orders in this snapshot', signal: 'velocity' }], canMutate: true,
};
const renderMarket = (overrides: Partial<ComponentProps<typeof MarketplaceWorkspace>> = {}) => renderToStaticMarkup(createElement(MarketplaceWorkspace, { ...marketProps, ...overrides }));

describe('Clinexa-aligned Security & SOS', () => {
  it('preserves all three tab identifiers, order and mounted panels', () => {
    const html = renderSecurity();
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    const text = source.security();
    expect(text.indexOf("id: 'register'")).toBeLessThan(text.indexOf("id: 'access'"));
    expect(text.indexOf("id: 'access'")).toBeLessThan(text.indexOf("id: 'overview'"));
    expect(html).toContain(' hidden=""');
  });
  it('uses shared cards, status, identity, controls and readable semantic tables', () => {
    const text = source.security();
    for (const component of ['Card', 'CardHeader', 'KpiCard', 'Avatar', 'Button', 'IconButton', 'StatusPill', 'EmptyState']) expect(text).toMatch(new RegExp(`<${component}(?:\\s|>)`));
    const html = renderSecurity();
    for (const value of ['<table', 'scope="col"', 'pb-table-scroll', 'role="region"', 'tabindex="0"', 'SOS-1041', 'Folake Bello', 'C-12B', 'SMS fallback']) expect(html).toContain(value);
    expect(text).not.toMatch(/text-\[(?:8|9|10\.5|11\.5|12\.5)px\]/);
  });
  it('preserves the emergency red and backup escalation at the 60-second boundary', () => {
    const text = source.security();
    expect(text).toContain('const ACK_TARGET = 60');
    expect(text).toContain('seconds >= ACK_TARGET');
    expect(text).toContain('escalate to backup responder');
    expect(text).toContain("toneVar(raised ? (over ? 'danger' : 'warn') : 'success')");
    expect(renderSecurity()).toContain('Escalate unacknowledged alerts to the backup responder at 60 seconds.');
  });
  it('uses actual recorded age rather than resetting a fictional elapsed time', () => {
    expect(sosElapsedSeconds('2026-10-23T08:59:00Z', nowMs)).toBe(60);
    expect(sosElapsedSeconds('2026-10-23T10:00:00Z', nowMs)).toBe(0);
    expect(sosElapsedSeconds('invalid', nowMs)).toBeNull();
    expect(sosElapsedLabel(59)).toBe('59s');
    expect(sosElapsedLabel(3660)).toBe('1h 1m');
    expect(sosElapsedLabel(90000)).toBe('1d 1h');
    expect(source.security()).not.toContain('14 + tick');
    expect(source.security()).toContain('clearInterval(timer)');
  });
  it('does not imply demo status changes dispatch emergency services or AI decisions', () => {
    const html = renderSecurity();
    expect(html).toContain('Demo incident records, not a connected emergency dispatch service.');
    expect(html).toContain('No AI drives SOS decisions.');
    expect(html).toContain('Record responder dispatch');
    expect(html).toContain('Sample checkpoints for the demo, not a verified live patrol record.');
    expect(html).not.toContain('verified at gate');
  });
  it('keeps native labelled pass previews with real inputs and no fake QR credential', () => {
    const text = source.security();
    expect(text).toContain('<PortalDialog label="Preview visitor pass"');
    expect(text).toContain('<form');
    expect(text).toContain('htmlFor={`${id}-visitor`}');
    expect(text).toContain('htmlFor={`${id}-unit`}');
    expect(text).toContain('aria-label="Close visitor pass preview"');
    expect(text).toContain('no scannable QR credential');
    expect(text).not.toContain('Array.from({ length: 16 })');
  });
  it('retains gates, legal payloads and in-page server errors without firing on render', () => {
    const html = renderSecurity({ canMutate: false });
    expect(html).not.toContain('>Acknowledge</button>');
    expect(html).not.toContain('>Preview pass</button>');
    expect(html).toContain('Read-only access');
    const text = source.security();
    expect(text).toContain('if (!canMutate || pending) return');
    expect(text).toContain("transition('sos-event', id, event)");
    expect(text).toContain('if (!result.ok)');
    expect(text).toContain('role="status"');
    expect(transition).not.toHaveBeenCalled();
  });
  it('shows truthful zeros and N/A without fabricating acknowledgement performance', () => {
    const html = renderSecurity({ events: [], canMutate: false });
    for (const value of ['No active incidents in this view', 'No incident records', 'No acknowledgement times yet', 'N/A']) expect(html).toContain(value);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('keeps acknowledge and responder actions immediate but routes resolution and review through confirmation', () => {
    expect(sosNeedsConfirmation('ACKNOWLEDGE')).toBe(false);
    expect(sosNeedsConfirmation('RESPOND')).toBe(false);
    expect(sosNeedsConfirmation('RESOLVE')).toBe(true);
    expect(sosNeedsConfirmation('REVIEW')).toBe(true);
    expect(sosNeedsConfirmation('UNKNOWN')).toBe(false);
    const text = source.security();
    expect(text).toContain('if (!canMutate || pending || !incident.actions.includes(event)) return');
    expect(text).toContain('if (sosNeedsConfirmation(event)) { setTerminal({ incident, event }); return; }');
    expect(text).toContain('fire(incident.id, event)');
    expect(text).toContain('canMutate && terminal && <SosTerminalDialog');
    expect(text).toContain('onConfirm={() => fire(terminal.incident.id, terminal.event)}');
    expect(transition).not.toHaveBeenCalled();
  });
  it('names terminal confirmation dialogs for the exact incident and explains their operational effect', () => {
    const incident = { ...events[1], status: 'responding' };
    const callbacks = { onClose: vi.fn(), onConfirm: vi.fn(), onDismissMessage: vi.fn() };
    const resolution = renderToStaticMarkup(createElement(SosTerminalDialog, { incident, event: 'RESOLVE', pending: false, message: null, ...callbacks }));
    const review = renderToStaticMarkup(createElement(SosTerminalDialog, { incident: { ...incident, status: 'resolved' }, event: 'REVIEW', pending: false, message: null, ...callbacks }));
    for (const value of ['<dialog', 'aria-label="Resolve incident SOS-1042"', '<form', 'Ada Okafor', 'Unit A-04', 'Confirm resolution', 'The record remains open for review.', 'aria-label="Close confirmation for SOS-1042"']) expect(resolution).toContain(value);
    expect(review).toContain('aria-label="Close and review incident SOS-1042"');
    expect(review).toContain('Confirm close &amp; review');
    expect(review).toContain('incident review is complete');
    expect(review).toContain('does not contact emergency services');
    expect(callbacks.onConfirm).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });
  it('blocks pending terminal submission and dismissal while keeping action errors inside the native dialog', () => {
    const html = renderToStaticMarkup(createElement(SosTerminalDialog, { incident: events[1], event: 'RESOLVE', pending: true, message: 'You do not have permission for this action.', onClose: vi.fn(), onConfirm: vi.fn(), onDismissMessage: vi.fn() }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('You do not have permission for this action.');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="Close confirmation for SOS-1042"[^>]*disabled=""/);
    const text = source.security();
    expect(text).toContain('canClose={!pending}');
    expect(text).toContain('submitEvent.preventDefault(); if (pending) return; onConfirm();');
    expect(text).toContain('if (pending) return;\n    setTerminal(null)');
    expect(text).toContain('message && !terminal &&');
    expect(text).toContain('if (!result.ok) { setMessage(result.error); return; }');
    expect(text).toContain('setTerminal(null);\n        setMessage');
  });
  it('labels acknowledgement samples and summaries honestly instead of verifying seeded response-SLA times', () => {
    const html = renderSecurity();
    for (const value of ['Recorded acknowledgement samples', 'Demo average acknowledgement', 'Demo/sample durations', 'not verified emergency response-SLA measurements', 'Acknowledgement values may be generated by the demo workflow', 'not verified response-SLA performance', 'Recorded demo acknowledgement: 42 seconds. Not a verified response SLA.']) expect(html).toContain(value);
    expect(html).not.toContain('Target met on');
    expect(html).not.toContain('Acknowledged in 42 seconds.');
    expect(html).toContain('Recorded samples under target: 1 of 2');
  });
});

describe('Clinexa-aligned Parcels & Lockers', () => {
  it('preserves both sections, uses shared patterns and removes the separate hero', () => {
    const text = source.parcels();
    const html = renderParcels();
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(text.indexOf("id: 'register'")).toBeLessThan(text.indexOf("id: 'overview'"));
    for (const component of ['Card', 'CardHeader', 'KpiCard', 'Avatar', 'StatusPill', 'Button', 'IconButton', 'EmptyState']) expect(text).toMatch(new RegExp(`<${component}(?:\\s|>)`));
    expect(text).not.toContain('pb-hero');
  });
  it('provides a labelled searchable and locally scrollable parcel register', () => {
    const html = renderParcels();
    for (const value of ['<table', '<thead>', '<tbody>', 'scope="col"', 'pb-table-scroll', 'tabindex="0"', 'type="search"', 'Search parcels', 'Parcel status', 'Overdue', 'Awaiting collection', 'Folake Bello', 'Jumia', 'A-01', 'At desk']) expect(html).toContain(value);
    expect(source.parcels()).not.toMatch(/<tr[^>]*onClick=/);
  });
  it('presents locker availability as text rather than colour alone', () => {
    const html = renderParcels();
    expect(html).toContain('M · Occupied');
    expect(html).toContain('S · Available');
    expect(html).toContain('50% of lockers occupied');
    expect(html).toContain('Snapshot 23 Oct 2026');
    expect(html).toContain('Collected on snapshot day');
  });
  it('uses exact server action permissions for create and update without granting more access', () => {
    const html = renderParcels({ canCreate: false, canMutate: false });
    expect(html).not.toContain('>Log parcel</button>');
    expect(html).not.toContain('Record collection for PKG-001');
    expect(html).not.toContain('Preview reminder for PKG-001');
    expect(html).toContain('Read-only access');
    const page = read('src/app/(ops)/(estate)/parcels/page.tsx');
    expect(page).toContain("can(actor, 'security_sos', 'create').allowed");
    expect(page).toContain("can(actor, 'security_sos', 'update').allowed");
    expect(page).toContain("requireCapability('security_sos', 'read', 'estate')");
  });
  it('requires a native confirmation before collection or reminder preview and preserves action payloads', () => {
    const text = source.parcels();
    expect(text).toContain('<PortalDialog');
    expect(text).toContain('canClose={!pending}');
    expect(text).toContain('Confirm collection');
    expect(text).toContain('collectParcel(confirmation.parcel.id)');
    expect(text).toContain('notifyResident(confirmation.parcel.id)');
    expect(text).toContain('No SMS, email or WhatsApp was sent.');
    expect(text).not.toContain('Resident notified');
    expect(text).toContain('Verify the recipient and pickup code');
    renderParcels();
    expect(collectParcel).not.toHaveBeenCalled();
    expect(notifyResident).not.toHaveBeenCalled();
  });
  it('shows a native named form with associated labels, pending guards and visible errors', () => {
    const html = renderToStaticMarkup(createElement(LogDialog, { onClose: vi.fn(), onDone: vi.fn() }));
    for (const value of ['<dialog', 'aria-label="Log a parcel"', '<form', 'name="residentName"', 'name="unitLabel"', 'name="courier"', 'name="size"', 'aria-label="Close parcel logging"', 'No resident notification is sent automatically.']) expect(html).toContain(value);
    expect(html).toMatch(/<label[^>]+for="[^"]+-resident"/);
    const text = source.parcels();
    expect(text).toContain('event.preventDefault()');
    expect(text).toContain('if (pending || !fields.residentName.trim()) return');
    expect(text).toContain('role="alert"');
    expect(text).toContain('aria-busy={pending}');
    expect(logParcel).not.toHaveBeenCalled();
  });
  it('keeps empty parcel and locker inventories usable without invalid charts', () => {
    const html = renderParcels({ parcels: [], lockers: [], kpis: { inLocker: 0, awaiting: 0, overdue: 0, collectedToday: 0, util: { used: 0, total: 0, pct: 0 } } });
    for (const value of ['No parcels recorded', 'No lockers configured', '0% of lockers occupied']) expect(html).toContain(value);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});

describe('Clinexa-aligned Marketplace', () => {
  it('preserves the four sections, tab order and all recorded states', () => {
    const html = renderMarket();
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    const text = source.marketplace();
    const ids = ['orders', 'vendors', 'catalogue', 'overview'];
    for (let i = 1; i < ids.length; i++) expect(text.indexOf(`id: '${ids[i - 1]}'`)).toBeLessThan(text.indexOf(`id: '${ids[i]}'`));
    for (const value of ['ORD-001', 'ORD-002', 'ORD-003', 'Folake Bello', 'Clean Lagos', 'Refunded', 'Home cleaning']) expect(html).toContain(value);
  });
  it('uses shared cards, full-sized controls and a semantic searchable catalogue', () => {
    const text = source.marketplace();
    for (const component of ['Card', 'CardHeader', 'KpiCard', 'Avatar', 'StatusPill', 'Button', 'IconButton', 'EmptyState']) expect(text).toMatch(new RegExp(`<${component}(?:\\s|>)`));
    const html = renderMarket();
    for (const value of ['pb-table-scroll', 'scope="col"', 'type="search"', 'Search marketplace listings', 'Listing status', 'aria-controls=', 'aria-expanded="false"']) expect(html).toContain(value);
    expect(text).not.toMatch(/text-\[(?:8|9|10\.5|11\.5|12\.5)px\]/);
  });
  it('preserves kobo and other currency cents instead of rounding recorded values', () => {
    expect(marketplaceMoney(1_200_025)).toBe('₦12,000.25');
    expect(marketplaceMoney(50)).toBe('₦0.5');
    expect(marketplaceMoney(0)).toBe('₦0');
    expect(marketplaceMoney(12_345, 'USD')).toBe('$123.45');
    expect(renderMarket()).toContain('₦12,000.25');
  });
  it('never adds mixed currencies into one naira KPI or mislabels signal currency', () => {
    const html = renderMarket({ orders: [{ ...orders[0], currency: 'USD' }, orders[1]] });
    expect(html).toContain('By currency');
    expect(html).toContain('Order value by currency');
    expect(html).toContain('Currencies are not converted or combined.');
    expect(html).toContain('$12,000.25');
    expect(html).toContain('Multiple currencies—see orders');
    expect(html).not.toContain('₦32,000.75');
  });
  it('distinguishes rule-based signals and session-only dismissal from audited AI review', () => {
    const html = renderMarket();
    expect(html).toContain('Rule-based signals for a human decision.');
    expect(html).toContain('These are not AI verdicts');
    expect(html).toContain('never block or decline an order automatically');
    expect(html).toContain('Hide for this session');
    expect(html).toContain('does not save an audit review');
    expect(html).not.toContain('Mark reviewed');
  });
  it('preserves mutation gates, explicit status confirmation and financial safety wording', () => {
    const text = source.marketplace();
    expect(text).toContain('if (!canMutate || pending || !confirmation) return');
    expect(text).toContain("transition('marketplace-order', confirmation.order.id, confirmation.action.event)");
    expect(text).toContain('canClose={!pending}');
    expect(text).toContain('Confirm status change');
    expect(text).toContain('does not transfer money, initiate a bank refund, confirm a gateway refund or settle a vendor payout');
    const html = renderMarket({ canMutate: false });
    expect(html).not.toContain('aria-label="Accept ORD-001"');
    expect(html).not.toContain('Hide ORD-001 signal for this session');
    expect(html).toContain('Read-only access');
    expect(html).toContain('Closed does not mean the vendor has been paid.');
    expect(transition).not.toHaveBeenCalled();
  });
  it('shows true empty vendor and catalogue states without fictional success rates', () => {
    const html = renderMarket({ orders: [], listings: [], vendors: [], flags: [], gmv: { grossMinor: 0, realizedMinor: 0, pendingMinor: 0, voidMinor: 0, orders: 0, realizedRate: 0 } });
    expect(html).toContain('No vendor activity');
    expect(html).toContain('No listings in your scope');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('uses responsive 24px/16px spacing and keeps collapsed accordions hidden', () => {
    const css = read('src/components/security/safety-market.module.css');
    for (const value of ['gap: 24px', 'gap: 16px', 'font-size: 14px', 'font-size: 12px', 'border-radius: 12px', 'min-width: 0', 'var(--tone-danger)', '.vendorDetail[hidden] { display: none; }']) expect(css).toContain(value);
    expect(css).toMatch(/@media \(max-width:/);
    expect(css).not.toContain('!important');
  });
});
