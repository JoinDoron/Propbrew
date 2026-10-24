import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BookingsWorkspace, bookingSlotWat, formatWatHour } from '@/components/portal/bookings-workspace';
import { VendorJobsWorkspace, type JobView } from '@/components/portal/vendor-jobs-workspace';
import { VendorOrdersWorkspace, type OrderView } from '@/components/portal/vendor-orders-workspace';
import { VendorListingsWorkspace } from '@/components/portal/vendor-listings-workspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/resident-bookings', () => ({ createBooking: vi.fn() }));
vi.mock('@/server/actions/transitions', () => ({ transition: vi.fn() }));
vi.mock('@/server/actions/work-orders', () => ({ fireWoTransition: vi.fn() }));
vi.mock('@/server/actions/vendor-listings', () => ({ createListing: vi.fn(), toggleListing: vi.fn() }));

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const source = (name: string) => read(`src/components/portal/${name}.tsx`);
const render = <Props extends object>(component: ComponentType<Props>, props: Props) => renderToStaticMarkup(createElement(component, props));
const renderings = [
  ['Resident amenities', () => render(BookingsWorkspace, { bookings: [] })],
  ['Vendor jobs', () => render(VendorJobsWorkspace, { jobs: [], nowMs: Date.parse('2026-07-26') })],
  ['Vendor orders', () => render(VendorOrdersWorkspace, { orders: [] })],
  ['Vendor listings', () => render(VendorListingsWorkspace, { listings: [], orders: [] })],
] as const;

describe('Clinexa resident booking and vendor portal workflows', () => {
  it.each(renderings)('%s retains two independent mounted sections and truthful empty states', (_label, screen) => {
    const html = screen();
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html.match(/hidden=""/g)).toHaveLength(1);
    expect(html).toContain('No ');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('pb-hero');
  });

  it.each(['bookings-workspace', 'vendor-jobs-workspace', 'vendor-orders-workspace', 'vendor-listings-workspace'])('%s composes shared cards, real review dialogs and responsive controls', (name) => {
    const view = source(name);
    expect(view).toContain('PortalCard');
    expect(view).toContain('CardHeader');
    expect(view).toContain('WorkspaceDecisionDialog');
    expect(view).toContain('layout.layout');
    expect(view).toContain('role="status"');
    expect(view).not.toContain('fixed inset-0');
    expect(view).not.toContain('rounded-full text-[12.5px]');
  });

  it('handles noon and local WAT storage correctly without changing approval rules', () => {
    expect(formatWatHour(12)).toBe('12pm WAT');
    expect(formatWatHour(8)).toBe('8am WAT');
    expect(formatWatHour(18)).toBe('6pm WAT');
    expect(bookingSlotWat('2026-07-27', 12)).toBe('2026-07-27T11:00:00.000Z');
    expect(bookingSlotWat('2026-07-27', 16)).toBe('2026-07-27T15:00:00.000Z');
    expect(source('bookings-workspace')).toContain("timeZone: 'Africa/Lagos'");
    expect(source('bookings-workspace')).toContain('wouldAutoApprove(amenity, slotISO)');
  });

  it('carries native fee currencies instead of inventing naira fees or wallet collection', () => {
    const html = render(BookingsWorkspace, { bookings: [{ id: 'booking-usd', amenity: 'Clubhouse', status: 'requested', slot: '2026-07-27T11:00:00Z', feeMinor: 12345, feeCurrency: 'USD', actions: [] }] });
    expect(html).toContain('$123.45');
    expect(html).not.toContain('₦123.45');
    expect(source('bookings-workspace')).toContain('does not collect a payment');
    expect(source('bookings-workspace')).not.toContain('clears from your unit wallet');
    const missing = render(BookingsWorkspace, { bookings: [{ id: 'missing-currency', amenity: 'Clubhouse', status: 'requested', slot: '2026-07-27T11:00:00Z', feeMinor: 12345, actions: [] }] });
    expect(missing).toContain('Fee currency not recorded');
    expect(missing).not.toContain('₦123.45');
  });

  it('separates vendor work values by currency and excludes unspecified currencies', () => {
    const job = (id: string, costMinor: number, costCurrency?: string): JobView => ({ id, ref: id, title: id, status: 'closed', costMinor, costCurrency, respondDueAt: null, resolveDueAt: null, requesterName: 'Resident', unitLabel: 'Unit A', actions: [] });
    const html = render(VendorJobsWorkspace, { jobs: [job('NGN-JOB', 10001, 'NGN'), job('USD-JOB', 20002, 'USD'), job('UNKNOWN-JOB', 30003)], nowMs: Date.parse('2026-07-26') });
    expect(html).toContain('₦100.01');
    expect(html).not.toContain('₦600.06');
    expect(html).toContain('not confirmed payouts');
    const view = source('vendor-jobs-workspace');
    expect(view).not.toContain('setInterval');
    expect(view).toContain('not a ticking live service clock');
    expect(view).toContain('job.costCurrency === currency');
  });

  it('does not combine order currencies or equate fulfilment with settlement', () => {
    const order = (id: string, currency: string, amountMinor: number): OrderView => ({ id, ref: id, listingTitle: id, residentName: 'Resident', status: 'fulfilled', amountMinor, currency, placedAt: '2026-07-26', actions: [] });
    const html = render(VendorOrdersWorkspace, { orders: [order('NGN-ORDER', 'NGN', 10001), order('USD-ORDER', 'USD', 20002)] });
    expect(html).toContain('₦100.01');
    expect(html).not.toContain('₦300.03');
    expect(html).toContain('not settled cash');
    expect(html).toContain('Fulfilled or closed does not mean paid');
    expect(source('vendor-orders-workspace')).toContain('order.currency === currency');
  });

  it('limits per-listing attribution to the native currency and discloses title matching', () => {
    const html = render(VendorListingsWorkspace, { listings: [{ id: 'listing-ngn', title: 'AC service', category: 'HVAC', status: 'active', priceMinor: 2500000, currency: 'NGN' }], orders: [{ listingTitle: 'AC service', amountMinor: 10001, status: 'fulfilled', currency: 'NGN' }, { listingTitle: 'AC service', amountMinor: 20002, status: 'closed', currency: 'USD' }, { listingTitle: 'AC service', amountMinor: 30003, status: 'closed' }] });
    expect(html).toContain('₦100.01');
    expect(html).not.toContain('₦600.06');
    expect(html).toContain('title-matched');
    expect(html).toContain('not confirmed cash');
    expect(source('vendor-listings-workspace')).toContain('order.currency === listing.currency');
  });

  it('keeps booking/listing creation and state changes default denied', () => {
    expect(source('bookings-workspace')).toContain('canCreate = false, canTransition = false');
    expect(source('vendor-jobs-workspace')).toContain('canTransition = false');
    expect(source('vendor-orders-workspace')).toContain('canTransition = false');
    expect(source('vendor-listings-workspace')).toContain('canCreate = false, canUpdate = false');
    expect(render(BookingsWorkspace, { bookings: [] })).toMatch(/<button[^>]+disabled=""[^>]*>[\s\S]*?Book an amenity/);
    expect(render(VendorListingsWorkspace, { listings: [], orders: [] })).toMatch(/<button[^>]+disabled=""[^>]*>[\s\S]*?New listing/);
  });

  it('protects native creation forms during submission and catches failures inside the active modal', () => {
    for (const name of ['bookings-workspace', 'vendor-listings-workspace']) {
      const view = source(name);
      expect(view).toContain('canClose={!pending}');
      expect(view).toContain('<fieldset disabled={pending}');
      expect(view).toContain('if (inFlight.current) return');
      expect(view).toContain('finally { inFlight.current = false; }');
      expect(view).toContain('role="alert"');
      expect(view).toContain('<form');
    }
    expect(source('vendor-listings-workspace')).toContain('type="number" min="0.01" step="0.01"');
    expect(source('vendor-listings-workspace')).toContain('Publishing makes this service active');
  });

  it('preserves route guards, currency metadata and exact capability verbs', () => {
    for (const [route, capability] of [['bookings', 'bookings_amenities'], ['jobs', 'work_orders'], ['orders', 'marketplace'], ['listings', 'marketplace']] as const) {
      const page = read(`src/app/(portal)/portal/${route}/page.tsx`);
      expect(page).toContain(`requireCapability('${capability}')`);
      expect(page.indexOf('await requireCapability')).toBeLessThan(page.indexOf('repos.'));
      expect(page).not.toContain('max-w-[720px]');
    }
    expect(read('src/app/(portal)/portal/bookings/page.tsx')).toContain('feeCurrency: b.fee?.currency ?? null');
    expect(read('src/app/(portal)/portal/jobs/page.tsx')).toContain('costCurrency: w.cost?.currency ?? null');
    expect(read('src/app/(portal)/portal/listings/page.tsx')).toContain('currency: o.amount.currency');
    expect(read('src/app/(portal)/portal/orders/page.tsx')).toContain("can(actor, 'marketplace', 'transition').allowed");
  });
});
