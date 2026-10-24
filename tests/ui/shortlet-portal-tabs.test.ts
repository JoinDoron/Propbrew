import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/resident-orders', () => ({ placeOrder: vi.fn() }));
vi.mock('@/server/actions/resident-requests', () => ({ raiseRequest: vi.fn() }));
vi.mock('@/server/actions/transitions', () => ({ raiseSos: vi.fn() }));

import { ShortletDashboard } from '@/components/shortlet/dashboard';
import { ShortletAnalytics } from '@/components/shortlet/analytics';
import { MarketplaceWorkspace } from '@/components/portal/marketplace-workspace';
import { RequestsWorkspace } from '@/components/portal/requests-workspace';
import { AnnouncementsWorkspace } from '@/components/portal/announcements-workspace';
import { SafetyWorkspace } from '@/components/portal/safety-workspace';

describe('Shortlet and own-record portal section tabs', () => {
  it('separates overview, availability, attention and revenue without dropping inactive content', () => {
    const html = renderToStaticMarkup(createElement(ShortletDashboard, {
      kpis: { revenueMinor: 1_000_000, profitMinor: 500_000, occupancyPct: 50, bookings: 2, cautionHeldMinor: 10_000 },
      monthLabel: 'July 2026', arrivals: [], departures: [], staying: [], calendar: [], days: [], revExp: [],
      attention: [{ kind: 'inspect', title: 'Inspect apartment A', sub: 'Checkout pending', href: '/shortlet/inspections' }],
    }));
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.match(/hidden=""/g)).toHaveLength(3);
    expect(html).toContain('Inspect apartment A');
    expect(html).toContain('Revenue vs expenses');
  });

  it('groups finance, occupancy and acquisition reports in independent sections', () => {
    const html = renderToStaticMarkup(createElement(ShortletAnalytics, { revExp: [], propProfit: [], occupancy: [], sources: [] }));
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('Profit by property');
    expect(html).toContain('Occupancy by apartment');
    expect(html).toContain('Booking source performance');
  });

  it('keeps discovery and the resident’s own orders in separate mounted sections', () => {
    const html = renderToStaticMarkup(createElement(MarketplaceWorkspace, {
      listings: [{ id: 'listing-1', title: 'AC service', vendorName: 'Local services', category: 'HVAC', priceMinor: 500_000, currency: 'NGN' }],
      orders: [{ id: 'order-1', ref: 'ORDER-ONE', listingTitle: 'Previously ordered service', status: 'placed', amountMinor: 500_000, currency: 'NGN' }],
    }));
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/hidden=""/g)).toHaveLength(1);
    expect(html).toContain('AC service');
    expect(html).toContain('ORDER-ONE');
  });

  it('upgrades request status views without duplicating the current request records', () => {
    const html = renderToStaticMarkup(createElement(RequestsWorkspace, {
      requests: [{ id: 'request-1', ref: 'REQUEST-UNIQUE', title: 'Leaking tap', status: 'new', priority: 'routine', assigneeName: 'Unassigned', createdAt: '2026-07-26' }],
    }));
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/REQUEST-UNIQUE/g)).toHaveLength(1);
    expect(html).toContain('Raise a request');
  });

  it('retains all and unread announcement views with a single visible record copy', () => {
    const html = renderToStaticMarkup(createElement(AnnouncementsWorkspace, {
      rows: [{ id: 'notice-1', title: 'Unique notice title', body: 'Pool open', audience: 'Residents', sentAt: '2026-07-26', aiDrafted: false, scope: 'Estate' }],
    }));
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/Unique notice title/g)).toHaveLength(1);
    expect(html).toContain('Search announcements');
  });

  it('never hides the emergency SOS action behind visitor or history tabs', () => {
    const html = renderToStaticMarkup(createElement(SafetyWorkspace, { events: [], canRaise: true }));
    expect(html.indexOf('Emergency SOS')).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).toContain('Review SOS alert');
    expect(html.indexOf('Review SOS alert')).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).toContain('not a connected emergency dispatch service');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('No SOS history.');
  });
});

const tabbedRoutes = [
  ...['agents', 'analytics', 'booking-page', 'bookings', 'calendar', 'channels', 'expenses', 'inspections', 'maintenance', 'plan', 'pricing', 'team', 'whatsapp']
    .map((route) => [`/shortlet/${route}`, `src/components/shortlet/${route === 'analytics' ? 'analytics' : `${route}-workspace`}.tsx`]),
  ['/shortlet', 'src/components/shortlet/dashboard.tsx'],
  ...['guests', 'properties', 'reviews'].map((route) => [`/shortlet/${route}`, `src/app/(ops)/shortlet/${route}/page.tsx`]),
  ...['announcements', 'bills', 'bookings', 'requests'].map((route) => [`/portal/${route}`, `src/components/portal/${route}-workspace.tsx`]),
  ['/portal/community', 'src/components/portal/community-hub.tsx'],
  ['/portal/marketplace', 'src/components/portal/marketplace-workspace.tsx'],
  ...['jobs', 'listings', 'orders'].map((route) => [`/portal/${route}`, `src/components/portal/vendor-${route}-workspace.tsx`]),
  ...[['projects', 'portfolio'], ['returns', 'returns'], ['updates', 'updates']].map(([route, workspace]) => [`/portal/${route}`, `src/components/portal/investor-${workspace}-workspace.tsx`]),
  ['/portal/security', 'src/components/portal/safety-workspace.tsx'],
  ['/portal', 'src/app/(portal)/portal/page.tsx'],
  ...['electricity', 'profile'].map((route) => [`/portal/${route}`, `src/app/(portal)/portal/${route}/page.tsx`]),
];

describe('Complete Shortlet and own-record portal route coverage', () => {
  it.each(tabbedRoutes)('%s declares explicit in-page section tabs', (_route, file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(source).toContain("from '@/components/ui/page-tabs'");
    expect(source).toContain('<PageTabs label=');
    expect(source.match(/id: ["']/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
