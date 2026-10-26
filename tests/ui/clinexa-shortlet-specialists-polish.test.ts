import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AgentsWorkspace } from '@/components/shortlet/agents-workspace';
import { BookingPageWorkspace } from '@/components/shortlet/booking-page-workspace';
import { ChannelsWorkspace } from '@/components/shortlet/channels-workspace';
import { PlanWorkspace } from '@/components/shortlet/plan-workspace';
import { TeamWorkspace } from '@/components/shortlet/team-workspace';
import { WhatsappWorkspace } from '@/components/shortlet/whatsapp-workspace';
import { shortletMoney } from '@/components/shortlet/shortlet-format';
import * as actions from '@/server/actions/shortlet';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/shortlet', () => ({ inviteAgent: vi.fn(), inviteMember: vi.fn(), setMemberRole: vi.fn(), removeMember: vi.fn(), toggleChannel: vi.fn(), changePlan: vi.fn(), toggleBookingPage: vi.fn(), saveBookingPage: vi.fn(), addPromoCode: vi.fn(), togglePromoCode: vi.fn() }));
vi.mock('@/server/actions/shortlet-control', () => ({ saveChannelConnection: vi.fn(), syncChannelConnection: vi.fn(), approveGuestMessage: vi.fn(), saveMessageTemplate: vi.fn(), scheduleBookingMessages: vi.fn() }));

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const component = (file: string) => source('src/components/shortlet/' + file + '.tsx');
const files = ['agents-workspace', 'booking-page-workspace', 'channels-workspace', 'plan-workspace', 'team-workspace', 'whatsapp-workspace'];
const tabs = [
  ['agents-workspace', ['agents', 'performance']],
  ['booking-page-workspace', ['settings', 'performance']],
  ['channels-workspace', ['connections', 'summary']],
  ['plan-workspace', ['current', 'compare']],
  ['team-workspace', ['members', 'permissions']],
  ['whatsapp-workspace', ['messages', 'templates', 'summary']],
] as const;

const agentProps: ComponentProps<typeof AgentsWorkspace> = { agents: [
  { id: 'lower', name: 'Lower contribution agency with a fully readable business name', phone: '+234 800 000 0001', commissionPct: 10, status: 'invited', bookings: 1, nights: 2, revenueMinor: 12345, commissionMinor: 1235 },
  { id: 'higher', name: 'Higher contribution agency', phone: '+234 800 000 0002', commissionPct: 5, status: 'active', bookings: 3, nights: 9, revenueMinor: 100001, commissionMinor: 5000 },
] };
const teamProps: ComponentProps<typeof TeamWorkspace> = {
  members: [{ id: 'owner', name: 'Recorded owner', phone: '+234 800 000 0003', role: 'owner', status: 'active', lastActive: 'Recorded 24 Oct 2026' }, { id: 'manager', name: 'Property manager with an untruncated full name', phone: '+234 800 000 0004', role: 'manager', status: 'invited', lastActive: 'Not recorded' }],
  roles: [{ key: 'owner', label: 'Owner', blurb: 'Own the operating decisions and recorded plan.' }, { key: 'manager', label: 'Manager', blurb: 'Review guest bookings and coordinate approved operating work.' }],
  modules: ['Bookings', 'Financial records'], matrix: { owner: { Bookings: 'manage', 'Financial records': 'manage' }, manager: { Bookings: 'manage', 'Financial records': 'view' } },
};
const bookingPageProps: ComponentProps<typeof BookingPageWorkspace> = {
  config: { enabled: false, slug: 'lagos-apartments', cancellationPolicy: 'Contact the responsible host before any cancellation.', holdHours: 6, promoCodes: [{ code: 'WELCOME10', pct: 10, active: true }] },
  funnel: { visits: 100, searches: 50, views: 40, enquiries: 8, confirmed: 4, conversionPct: 50 },
  aptFunnels: [{ name: 'Penthouse apartment with a fully readable property name', rateMinor: 100001, views: 40, enquiries: 8, confirmed: 4, conversionPct: 50 }],
  preview: [{ name: 'Penthouse apartment with a fully readable property name', property: 'Ikoyi', type: 'Penthouse', rateMinor: 100001 }], businessName: 'Lagos Apartments',
};
const channelProps: ComponentProps<typeof ChannelsWorkspace> = {
  apartments: [{ id: 'apartment', name: 'West-facing serviced apartment with a full property name', property: 'Ikoyi', channels: ['airbnb'], feedUrl: 'https://ical.vesta.ng/sample-apartment.ics' }],
  summary: { connections: 1, apartmentsSynced: 1, byChannel: [{ channel: 'airbnb', label: 'Airbnb', count: 1 }, { channel: 'booking_com', label: 'Booking.com', count: 0 }, { channel: 'google', label: 'Google Calendar', count: 0 }] },
  conflicts: [{ apt: 'West-facing serviced apartment with a full property name', guestA: 'First guest complete name', guestB: 'Second guest complete name', rangeA: '2026-10-24 → 2026-10-28', rangeB: '2026-10-26 → 2026-10-30', nights: 2 }], lastSync: '2026-10-24T08:00:00Z',
};
const planProps: ComponentProps<typeof PlanWorkspace> = {
  plans: [{ key: 'lite', name: 'Lite', priceMonthlyMinor: 12345, apartmentCap: 1, entitlements: ['Recorded booking register', 'Guest details'] }, { key: 'growth', name: 'Growth', priceMonthlyMinor: 100001, apartmentCap: 10, badge: 'Growing portfolio', entitlements: ['Channel preference records', 'Team operating roles', 'Full feature description without truncation'] }],
  currentKey: 'lite', apartmentCount: 2, recommendation: { key: 'growth', reasons: ['Your portfolio exceeds the Lite recorded allowance.', 'The channel and team feature preferences are configured.'] }, order: ['lite', 'growth'],
};
const whatsappProps: ComponentProps<typeof WhatsappWorkspace> = {
  stats: { sent: 12, scheduled: 8, delivered: 11, read: 9 },
  templates: [{ key: 'prearrival', label: 'Pre-arrival preparation', trigger: 'One day before recorded check-in', body: 'Hello {{guest}}.\nArrival details for {{apartment}}: {{access}}.\nReview {{missing}} before sending.' }],
  sampleVars: { guest: 'Ada', apartment: 'West apartment', access: 'Contact the responsible host at the staffed reception.' },
  timeline: Array.from({ length: 15 }, (_, index) => ({ id: 'booking-' + index, ref: 'SL-' + index, guest: 'Guest ' + index + ' complete name', apt: 'West apartment', messages: [{ key: 'prearrival', label: 'Pre-arrival preparation', whenISO: '2026-10-24', status: 'scheduled', preview: 'Full planned message with an untruncated explanation.\nNo provider delivery has been verified.' }] })),
};

describe('Clinexa Shortlet specialist composition polish', () => {
  it.each(files)('%s uses explicit inner composition, not compact legacy markup', (file) => {
    const text = component(file);
    expect(text).toContain("from './shortlet-specialists-polish.module.css'");
    expect(text).toContain('<CardHeader');
    expect(text).toContain('<StatusPill');
    expect(text).not.toContain('truncate');
    expect(text).not.toContain('.slice(');
    expect(text).not.toMatch(/text-\[(?:8|9|10|11)px\]/);
    expect(text).not.toContain('pb-dialog-title');
    expect(text).not.toContain('aria-label="Close dialog"');
  });

  it.each(tabs)('preserves %s section IDs and order', (file, expected) => {
    const ids = [...component(file).matchAll(/id:\s*["']([^"']+)["']/g)].map((match) => match[1]);
    expect(ids).toEqual(expected);
  });

  it('provides responsive spacing, real 44px switches, rounded pale headers and contained tables', () => {
    const css = source('src/components/shortlet/shortlet-specialists-polish.module.css');
    expect(css).toContain('gap: 24px');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('gap: 16px');
    expect(css).toContain('font-size: 16px; font-weight: 500');
    expect(css).toContain('font-size: 14px; line-height: 1.7');
    expect(css).toContain('border-radius: var(--radius-card) var(--radius-card) 0 0');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('width: 44px; height: 44px');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).toContain('.progress::-webkit-progress-value');
    expect(css).toContain('.progress::-moz-progress-bar');
  });

  it('actually ranks agents by value and retains full names, booking data and exact commission', () => {
    const html = renderToStaticMarkup(createElement(AgentsWorkspace, agentProps));
    expect(html.indexOf('Higher contribution agency')).toBeLessThan(html.indexOf('Lower contribution agency'));
    expect(html).toContain('Lower contribution agency with a fully readable business name');
    expect(html).toContain('9 nights');
    expect(html).toContain(shortletMoney(100001));
    expect(html).toContain(shortletMoney(1235));
    expect(html).toContain('not an approved payable');
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*tabindex="0")(?=[^>]*aria-label="Shortlet agent performance register")[^>]*>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Invite agent<\/button>/);
  });

  it('retains team responsibilities and textual permission levels without granting authentication access', () => {
    const html = renderToStaticMarkup(createElement(TeamWorkspace, teamProps));
    expect(html).toContain('Property manager with an untruncated full name');
    expect(html).toContain('Review guest bookings and coordinate approved operating work.');
    expect(html).toContain('manage');
    expect(html).toContain('view');
    expect(html).toContain('<th scope="row">Financial records</th>');
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*tabindex="0")(?=[^>]*aria-label="Shortlet role permission reference table")[^>]*>/);
    expect(html).toContain('editing these records does not provision accounts');
    expect(html).not.toContain('Remove Recorded owner');
    expect(html).toContain('The owner role cannot be changed or removed here.');
  });

  it('keeps booking configuration distinct from a verified public site or measured funnel', () => {
    const html = renderToStaticMarkup(createElement(BookingPageWorkspace, bookingPageProps));
    expect(html).toContain('Legacy sample URL · not a verified Propbrew public domain');
    expect(html).toContain('book.vesta.ng/lagos-apartments');
    expect(html).toContain('not measured visits');
    expect(html).toContain('Penthouse apartment with a fully readable property name');
    expect(html).toContain(shortletMoney(100001));
    expect(html).toContain('WELCOME10');
    expect(html).toContain('aria-label="Illustrative apartment booking funnel table" tabindex="0"');
    expect(html).toContain('No live analytics provider is connected.');
    expect(component('booking-page-workspace')).not.toContain('browser chrome');
  });

  it('makes channel preferences, provider gaps and full conflicts readable without provider claims', () => {
    const html = renderToStaticMarkup(createElement(ChannelsWorkspace, channelProps));
    expect(html).toContain('West-facing serviced apartment with a full property name');
    expect(html).toContain('First guest complete name');
    expect(html).toContain('Second guest complete name');
    expect(html).toContain('2026-10-24 → 2026-10-28');
    expect(html).toContain('24 Oct 2026, 09:00 WAT');
    expect(html).toContain('Channel sync foundation');
    expect(html).toContain('Connect an iCal feed');
    expect(html).toContain('does not reserve dates or prevent an external booking');
  });

  it('shows full plan entitlements, allowance constraints and exact catalogue amounts without charging', () => {
    const html = renderToStaticMarkup(createElement(PlanWorkspace, planProps));
    expect(html).toContain('Over recorded allowance');
    expect(html).toContain(shortletMoney(12345));
    expect(html).toContain(shortletMoney(100001));
    expect(html).toContain('Full feature description without truncation');
    expect(html).toContain('Your portfolio exceeds the Lite recorded allowance.');
    expect(html).toContain('not a connected subscription checkout');
    expect(html).toContain('aria-label="Annual billing" aria-checked="false"');
    expect(html).toContain('Read-only catalogue.');
    expect(html).not.toContain('Payment collected successfully');
  });

  it('does not claim an allowance or current price when no plan matches the record', () => {
    const html = renderToStaticMarkup(createElement(PlanWorkspace, { ...planProps, plans: [], currentKey: 'missing' }));
    expect(html).toContain('No plan record');
    expect(html).toContain('No plans in the catalogue');
    expect(html).not.toContain('Within recorded allowance');
    expect(html).not.toContain('NaN');
  });

  it('retains every supplied communication plan and full draft/preview text with explicit modelled status', () => {
    const html = renderToStaticMarkup(createElement(WhatsappWorkspace, whatsappProps));
    expect(html).toContain('Guest 14 complete name');
    expect(html).toContain('Guest 14 complete name');
    expect(html).toContain('Full planned message with an untruncated explanation.');
    expect(html).toContain('24 Oct 2026');
    expect(html).toContain('WAT date, not a dispatch timestamp');
    expect(html).toContain('Hello Ada.');
    expect(html).toContain('Contact the responsible host at the staffed reception.');
    expect(html).toContain('{{missing}}');
    expect(html).toContain('signed delivery callbacks');
    expect(html).toContain('durable retry queue');
    expect(html).toContain('aria-label="Pre-arrival preparation template" disabled=""');
    expect(html).toContain('manager approval');
  });

  it('supplies truthful empty states for every sparse specialist data set', () => {
    expect(renderToStaticMarkup(createElement(AgentsWorkspace, { agents: [] }))).toContain('No agents recorded');
    expect(renderToStaticMarkup(createElement(TeamWorkspace, { members: [], roles: [], modules: [], matrix: {} }))).toContain('No permission reference supplied');
    expect(renderToStaticMarkup(createElement(ChannelsWorkspace, { apartments: [], summary: { connections: 0, apartmentsSynced: 0, byChannel: [] }, conflicts: [], lastSync: 'No verified provider sync' }))).toContain('No apartments to configure');
    expect(renderToStaticMarkup(createElement(WhatsappWorkspace, { stats: { sent: 0, scheduled: 0, delivered: 0, read: 0 }, templates: [], timeline: [], sampleVars: {} }))).toContain('No templates available');
    expect(renderToStaticMarkup(createElement(BookingPageWorkspace, { ...bookingPageProps, aptFunnels: [], config: { ...bookingPageProps.config, promoCodes: [] } }))).toContain('No promo codes yet.');
  });

  it('keeps native form approval, pending protection and errors in one active shared dialog', () => {
    for (const file of ['agents-workspace', 'booking-page-workspace', 'team-workspace']) {
      const text = component(file);
      expect(text).toContain('<ShortletDialog');
      expect(text).toContain('<ShortletReview');
      expect(text).toContain('<form');
      expect(text).toContain('event.preventDefault()');
      expect(text).toContain('pending={pending}');
      expect(text).toContain('inFlight.current');
      expect(text).toContain('role="alert"');
    }
  });

  it('does not invoke any operational write or provider action while rendering the workspaces', () => {
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });
});
