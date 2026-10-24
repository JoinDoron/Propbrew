import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RewardsWorkspace } from '@/components/estate/rewards-workspace';
import { EventsWorkspace } from '@/components/estate/events-workspace';
import { BookingsWorkspace } from '@/components/bookings/bookings-workspace';
import { awardPoints, redeemPerk, rsvpEvent, cancelRsvp, createEvent } from '@/server/actions/estate';
import { transition } from '@/server/actions/transitions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/estate', () => ({ awardPoints: vi.fn(), redeemPerk: vi.fn(), rsvpEvent: vi.fn(), cancelRsvp: vi.fn(), createEvent: vi.fn() }));
vi.mock('@/server/actions/transitions', () => ({ transition: vi.fn() }));
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const rewardSource = () => read('src/components/estate/rewards-workspace.tsx');
const eventSource = () => read('src/components/estate/events-workspace.tsx');
const bookingSource = () => read('src/components/bookings/bookings-workspace.tsx');
const nowMs = Date.parse('2026-10-23T10:00:00Z');
const rewardProps: ComponentProps<typeof RewardsWorkspace> = {
  canMutate: true,
  members: [{ id: 'm-1', residentName: 'Ada Okafor', unitLabel: 'Block A · 1', points: 1650, onTimeStreak: 4, eventsAttended: 2, pollsVoted: 3 }, { id: 'm-2', residentName: 'Tobi Ade', unitLabel: 'Block B · 2', points: 100, onTimeStreak: 1, eventsAttended: 0, pollsVoted: 0 }],
  perks: [{ id: 'p-1', title: 'Clubhouse credit', detail: 'One community room session', cost: 500, category: 'Amenity', stock: 2 }, { id: 'p-2', title: 'Garden kit', detail: 'Seasonal kit', cost: 4000, category: 'Community', stock: 0 }],
  kpis: { members: 2, pointsIssued: 1750, goldPlus: 1, perks: 2 },
};
const eventProps: ComponentProps<typeof EventsWorkspace> = {
  canMutate: true, canCreate: true, nowMs,
  events: [{ id: 'e-1', title: 'Community dinner', category: 'social', venue: 'Clubhouse', host: 'Social committee', startISO: '2026-10-24T18:00:00Z', endISO: '2026-10-24T20:00:00Z', capacity: 30, rsvps: 20 }, { id: 'e-2', title: 'Past meeting', category: 'meeting', venue: 'Hall', host: 'Board', startISO: '2026-10-01T18:00:00Z', endISO: '2026-10-01T20:00:00Z', capacity: 20, rsvps: 10 }, { id: 'e-3', title: 'Cancelled picnic', category: 'kids', venue: 'Garden', host: 'Parents', startISO: '2026-10-25T18:00:00Z', endISO: '2026-10-25T20:00:00Z', capacity: 20, rsvps: 0, cancelled: true }],
  amenities: [{ venue: 'Clubhouse', rsvps: 20, events: 1 }], kpis: { upcoming: 1, totalRsvps: 20, full: 0, topVenue: 'Clubhouse' },
};
const bookingProps: ComponentProps<typeof BookingsWorkspace> = {
  canMutate: true, bookings: [{ id: 'b-1', amenity: 'Clubhouse', residentName: 'Ada Okafor', status: 'requested', slot: '2026-10-24T18:00:00Z', feeMinor: 1500050, feeCurrency: 'NGN', actions: [{ event: 'APPROVE', label: 'Approve', variant: 'primary' }] }, { id: 'b-2', amenity: 'Gym', residentName: 'Tobi Ade', status: 'confirmed', slot: '2026-10-24T08:00:00Z', feeMinor: 50, feeCurrency: 'USD', actions: [] }, { id: 'b-3', amenity: 'Tennis Court', residentName: 'Ngozi Ade', status: 'completed', slot: '2026-10-20T08:00:00Z', feeMinor: 25, feeCurrency: 'NGN', actions: [] }],
};
const rewards = (overrides: Partial<typeof rewardProps> = {}) => renderToStaticMarkup(createElement(RewardsWorkspace, { ...rewardProps, ...overrides }));
const events = (overrides: Partial<typeof eventProps> = {}) => renderToStaticMarkup(createElement(EventsWorkspace, { ...eventProps, ...overrides }));
const bookings = (overrides: Partial<typeof bookingProps> = {}) => renderToStaticMarkup(createElement(BookingsWorkspace, { ...bookingProps, ...overrides }));

beforeEach(() => vi.clearAllMocks());

describe('Clinexa-aligned community experience workspaces', () => {
  it('composes the shared visual language instead of compact legacy heroes', () => {
    for (const source of [rewardSource(), eventSource(), bookingSource()]) {
      expect(source).toContain('workspace-layout.module.css');
      for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'Button', 'IconButton', 'StatusPill', 'EmptyState']) expect(source).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
      expect(source).not.toContain('pb-hero');
      expect(source).not.toMatch(/text-\[(?:9|9\.5|10|10\.5|11|11\.5|12\.5)px\]/);
      expect(source).not.toMatch(/<KpiCard[^>]*\bdelta=/);
    }
  });

  it('preserves original Rewards and Events tab identifiers and ordering', () => {
    for (const [source, html, ids] of [[rewardSource(), rewards(), ['members', 'perks', 'overview']], [eventSource(), events(), ['events', 'overview']]] as const) {
      expect(html.match(/role="tab"/g)).toHaveLength(ids.length);
      expect(html.match(/role="tabpanel"/g)).toHaveLength(ids.length);
      ids.forEach((id, index) => { expect(source).toContain(`id: '${id}'`); if (index) expect(source.indexOf(`id: '${id}'`)).toBeGreaterThan(source.indexOf(`id: '${ids[index - 1]}'`)); });
      expect(html).toContain(' hidden=""');
    }
  });

  it('preserves the conditional booking approval section and every stable section id', () => {
    const source = bookingSource();
    for (const id of ['overview', 'approvals', 'availability', 'register']) expect(source).toContain(`id: '${id}'`);
    expect(bookings().match(/role="tab"/g)).toHaveLength(4);
    expect(bookings({ bookings: [] }).match(/role="tab"/g)).toHaveLength(3);
    expect(source).toContain('queue.length > 0');
  });

  it('uses readable locally scrollable semantic registers with real table headings', () => {
    for (const html of [rewards(), events(), bookings()]) for (const token of ['pb-table-scroll', 'pb-data-table', '<thead>', '<tbody>', 'scope="col"', 'role="region"', 'tabindex="0"']) expect(html).toContain(token);
    for (const source of [rewardSource(), eventSource(), bookingSource()]) expect(source).not.toMatch(/<tr[^>]*onClick=/);
  });

  it('keeps every member identity, balance, activity and tier in the leaderboard', () => {
    const html = rewards();
    for (const m of rewardProps.members) for (const text of [m.residentName, m.unitLabel, m.points.toLocaleString('en-NG')]) expect(html).toContain(text);
    expect(html).toContain('Gold'); expect(html).toContain('Bronze');
    expect(html).toContain('4 month payment streak'); expect(html).toContain('2 events · 3 polls');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Search reward members');
  });

  it('keeps reward units distinct from cash or lifetime points', () => {
    const html = rewards();
    expect(html).toContain('Current point balances');
    expect(html).toContain('not lifetime earnings');
    expect(html).toContain('reward units, not cash');
    expect(html).not.toContain('points in circulation');
  });

  it('retains perk stock and prices and disables unaffordable or exhausted perks', () => {
    const html = rewards();
    for (const p of rewardProps.perks) for (const text of [p.title, p.detail, p.category]) expect(html).toContain(text);
    expect(html).toContain('2 available'); expect(html).toContain('Out of stock'); expect(html).toContain('4,000');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Review redemption of Garden kit"/);
  });

  it('gates reward writes by the server’s exact update capability without hiding read content', () => {
    const html = rewards({ canMutate: false });
    expect(html).toContain('Read-only access'); expect(html).toContain('Clubhouse credit');
    expect(html).not.toContain('Review redemption of'); expect(html).not.toContain('On-time payment +100');
    expect(read('src/app/(ops)/(estate)/rewards/page.tsx')).toContain("can(actor, 'announcements', 'update').allowed");
  });

  it('offers explicit zero-data states across all three experiences', () => {
    const html = rewards({ members: [], perks: [], kpis: { members: 0, pointsIssued: 0, goldPlus: 0, perks: 0 } }) + events({ events: [], amenities: [], kpis: { upcoming: 0, totalRsvps: 0, full: 0, topVenue: '—' } }) + bookings({ bookings: [] });
    for (const label of ['No reward members yet', 'No perks available', 'No upcoming events', 'No event records', 'No venue demand yet', 'No bookings yet', 'No confirmed fees']) expect(html).toContain(label);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('retains historical and cancelled events in the event register', () => {
    const html = events();
    for (const e of eventProps.events) expect(html).toContain(e.title);
    expect(html).toContain('All recorded events in your scope');
    expect(html).toContain('>Cancelled</span>');
    expect(html).toContain('20 of 30 places reserved');
    expect(html).toContain('Search community events');
  });

  it('keeps event dates pinned to the supplied snapshot and displays explicit Nigerian time', () => {
    const source = eventSource(); const html = events();
    expect(source).toContain("timeZone: 'Africa/Lagos'"); expect(source).not.toMatch(/Date\.now\(/);
    expect(html).toContain('snapshot'); expect(html).toContain('WAT'); expect(html).toContain('07:00 pm');
    expect(source).toContain('new Date(nowMs).toISOString().slice(0, 10)');
  });

  it('gates new event creation and RSVP updates separately with exact action verbs', () => {
    const html = events({ canCreate: false, canMutate: false });
    expect(html).not.toContain('>New event<'); expect(html).not.toContain('Review RSVP for');
    const page = read('src/app/(ops)/(estate)/events/page.tsx');
    expect(page).toContain("can(actor, 'bookings_amenities', 'create').allowed");
    expect(page).toContain("can(actor, 'bookings_amenities', 'update').allowed");
  });

  it('does not imply that RSVP counters represent named attendance or message delivery', () => {
    const source = eventSource();
    expect(source).toContain('does not record a named attendee or send a confirmation message');
    expect(source).toContain('not confirmed attendance');
    expect(source).toContain('two-hour event starting at 19:00 WAT');
  });

  it('preserves all booking records and original statuses, slots and permitted events', () => {
    const html = bookings();
    for (const b of bookingProps.bookings) for (const text of [b.id, b.amenity, b.residentName]) expect(html).toContain(text);
    for (const status of ['requested', 'confirmed', 'completed']) expect(html).toContain(`value="${status}"`);
    expect(html).toContain('Review approve for Ada Okafor at Clubhouse');
    expect(html).toContain('Booking status'); expect(html).toContain('Search bookings');
    expect(bookingSource()).not.toMatch(/max-\[560px\]:hidden/);
  });

  it('keeps exact minor-unit amounts in their recorded currencies without aggregation or conversion', () => {
    const html = bookings();
    expect(html).toContain('₦15,000.5'); expect(html).toContain('$0.5'); expect(html).toContain('₦0.25');
    expect(html).toContain('2 currencies'); expect(html).toContain('Different currencies remain separate');
    expect(read('src/app/(ops)/(estate)/bookings/page.tsx')).toContain('feeCurrency: b.fee?.currency');
  });

  it('labels deterministic heatmaps and scaled utilisation as illustrations, never real-time availability', () => {
    const html = bookings(); const source = bookingSource();
    expect(html).toContain('Illustrative demand only'); expect(html).toContain('not availability calculated from booking records');
    expect(html).toContain('Demo-scaled'); expect(html).toContain('not a measured occupancy rate');
    expect(source).not.toContain('Math.max(4, u.pct)');
    expect(html).not.toMatch(/AI-scored|animate-ping|>\s*live\s*</i);
  });

  it('never claims booking fees were collected or settled by a workflow transition', () => {
    const source = bookingSource(); const html = bookings();
    expect(html).toContain('not proof of payment or settlement');
    expect(html).not.toContain('Fees are collected');
    expect(source).toContain('does not initiate or verify a payment');
  });

  it('gates booking transitions by the server’s transition verb and preserves read-only records', () => {
    const html = bookings({ canMutate: false });
    expect(html).toContain('Read-only access'); expect(html).toContain('Ada Okafor');
    expect(html).not.toContain('Review approve for');
    expect(read('src/app/(ops)/(estate)/bookings/page.tsx')).toContain("can(actor, 'bookings_amenities', 'transition').allowed");
  });

  it('uses pending-protected native dialogs with visible errors for every mutation path', () => {
    for (const source of [rewardSource(), eventSource(), bookingSource()]) {
      expect(source).toContain('<PortalDialog'); expect(source).toContain('canClose={!pending}'); expect(source).toContain('role="alert"');
      expect(source).toContain('disabled={pending}'); expect(source).toContain('router.refresh()'); expect(source).toContain('catch');
      expect(source).not.toContain('fixed inset-0 z-');
    }
    expect(rewardSource()).toContain('Confirm redemption'); expect(bookingSource()).toContain('Confirm ${review.action.label'); expect(eventSource()).toContain('Confirm RSVP');
  });

  it('has responsive card rhythm, 14px body, 12px metadata and accessible controls without shrinking labels', () => {
    const shared = read('src/components/ui/workspace-layout.module.css'); const local = read('src/components/estate/experience-workspaces.module.css');
    expect(shared).toContain('gap: 24px'); expect(shared).toContain('gap: 16px'); expect(shared).toContain('font-size: 14px'); expect(shared).toContain('font-size: 12px');
    expect(shared).toContain('@media (pointer: coarse)'); expect(local).toContain('min-width: 980px'); expect(local).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('does not execute any mutations while rendering manager or read-only previews', () => {
    rewards(); rewards({ canMutate: false }); events(); events({ canCreate: false, canMutate: false }); bookings(); bookings({ canMutate: false });
    for (const fn of [awardPoints, redeemPerk, rsvpEvent, cancelRsvp, createEvent, transition]) expect(fn).not.toHaveBeenCalled();
  });
});
