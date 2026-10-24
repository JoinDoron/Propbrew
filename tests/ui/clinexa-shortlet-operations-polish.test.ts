import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BookingsWorkspace, type BookingRow } from '@/components/shortlet/bookings-workspace';
import { CalendarWorkspace, type CalBooking } from '@/components/shortlet/calendar-workspace';
import { InspectionsWorkspace, PackModal, inspectionPackText, type DoneRow, type PendingRow } from '@/components/shortlet/inspections-workspace';
import { MaintenanceWorkspace, type IssueRow } from '@/components/shortlet/maintenance-workspace';
import { ShortletDialog } from '@/components/shortlet/reference-ui';

const actions = vi.hoisted(() => ({ createBooking: vi.fn(), advanceBooking: vi.fn(), recordPayment: vi.fn(), saveInspection: vi.fn(), logIssue: vi.fn(), advanceIssue: vi.fn() }));
vi.mock('@/server/actions/shortlet', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const source = (name: string) => read(`src/components/shortlet/${name}-workspace.tsx`);
const text = (html: string) => html.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&');
const money = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
const booking: BookingRow = {
  id: 'booking-lagos', ref: 'BK-2026-001', guest: 'Adeola Samuel Omosehin', phone: '+2348012345678', apt: 'The Long Garden Apartment', property: 'Lekki Waterfront Property', propertyId: 'property-one',
  checkIn: '2026-10-23', checkOut: '2026-10-26', nights: 3, source: 'whatsapp', status: 'confirmed',
  totalMinor: 1234567, paidMinor: 1000001, outstandingMinor: 234566, nightlyMinor: 411522,
  cautionFeeMinor: 100001, cautionStatus: 'held', cautionDeductedMinor: 101,
  wifiSsid: 'Guest WiFi', wifiPassword: 'demo-password', access: 'Collect the key from reception',
  houseRules: ['No smoking', 'Quiet hours after 10pm', 'No parties', 'Keep the keys safe', 'Fifth rule must remain visible'], repeat: true,
  bank: { name: 'Example Bank', account: 'Lagos Stays', number: '0123456789' }, actions: [],
};
const apartments = [{ id: 'apartment-one', name: booking.apt, property: booking.property, rateMinor: booking.nightlyMinor }];
const pending: PendingRow = { id: booking.id, ref: booking.ref, guest: booking.guest, apt: booking.apt, property: booking.property, cautionFeeMinor: booking.cautionFeeMinor };
const completed: DoneRow = {
  bookingId: booking.id, ref: booking.ref, guest: booking.guest, apt: booking.apt, at: '2026-10-23T23:30:00Z', outcome: 'damage_recorded', damageMinor: 12345,
  cautionFeeMinor: booking.cautionFeeMinor, cautionStatus: 'partly_deducted', items: [{ label: 'Living room', condition: 'damaged', note: 'A full recorded damage note', chargeMinor: 12345 }, { label: 'Kitchen', condition: 'ok' }],
};
const issue: IssueRow = { id: 'issue-one', apt: booking.apt, apartmentId: apartments[0].id, title: 'Air-conditioning unit needs an inspection', description: 'The guest reports intermittent cooling in the bedroom. This entire description must remain readable.', priority: 'high', status: 'resolved', createdAt: '2026-10-23T23:30:00Z', resolvedAt: '2026-10-24T10:15:00Z' };
const nowMs = Date.parse('2026-10-23');
const calBooking: CalBooking = { id: booking.id, apartmentId: apartments[0].id, ref: booking.ref, guestName: booking.guest, status: 'confirmed', checkIn: booking.checkIn, checkOut: booking.checkOut, source: 'whatsapp' };

describe('Shortlet operations Clinexa polish', () => {
  it.each(['bookings', 'calendar', 'inspections', 'maintenance'])('composes the %s interior with shared cards and scoped reference styles', (name) => {
    const code = source(name);
    expect(code).toContain("'./shortlet-operations-polish.module.css'");
    expect(code).toContain('<CardHeader');
    expect(code).toContain('<EmptyState');
    expect(code).toContain('<Button');
    expect(code).not.toMatch(/pb-(?:filter|form-control|form-label|action|dialog-title|icon-action|register-toolbar)/);
    expect(code).not.toContain('truncate');
    expect(code).not.toMatch(/text-\[(?:8|9|10|11|12)(?:\.5)?px\]/);
    expect(code).not.toContain('aria-label="Close dialog"');
  });

  it('keeps reference spacing, readable table rows, exact control sizing and touch targets opt-in', () => {
    const css = read('src/components/shortlet/shortlet-operations-polish.module.css');
    for (const token of ['gap: 24px', 'gap: 16px', 'padding: 24px', 'padding: 16px', 'border-radius: 12px', 'border-radius: 10px', 'font-size: 16px; font-weight: 500', 'font-size: 14px', 'font-size: 12px', 'height: 64px', 'min-height: 40px', 'min-height: 44px', 'overflow-x: auto', 'var(--primary-weak)', 'background: var(--surface-2)', 'focus-visible']) expect(css).toContain(token);
    expect(css).not.toContain(':global');
  });

  it.each([
    ['bookings', ['bookings', 'summary']], ['calendar', ['calendar', 'legend']],
    ['inspections', ['pending', 'completed']], ['maintenance', ['issues', 'summary']],
  ] as const)('preserves the original %s tab IDs and order', (name, ids) => {
    const code = source(name);
    expect(code.indexOf(`id: "${ids[0]}"`)).toBeGreaterThan(-1);
    expect(code.indexOf(`id: "${ids[1]}"`)).toBeGreaterThan(code.indexOf(`id: "${ids[0]}"`));
  });

  it('keeps all eight operations panels mounted even when records are empty', () => {
    const screens = [
      renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [], apartments: [] })),
      renderToStaticMarkup(createElement(CalendarWorkspace, { apartments: [], bookings: [], nowMs })),
      renderToStaticMarkup(createElement(InspectionsWorkspace, { pending: [], done: [] })),
      renderToStaticMarkup(createElement(MaintenanceWorkspace, { issues: [], apartments: [], stats: { open: 0, inProgress: 0, resolvedThisMonth: 0 } })),
    ];
    for (const html of screens) {
      expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
      expect(html.match(/hidden=""/g)).toHaveLength(1);
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('Infinity');
    }
    expect(screens[0]).toContain('No bookings here');
    expect(screens[1]).toContain('No recorded stays in this period');
    expect(screens[2]).toContain('No checkouts are awaiting inspection');
    expect(screens[3]).toContain('No issues here');
  });

  it('shows complete booking identity, WAT stay dates, source, phone and kobo balances', () => {
    const html = renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [booking], apartments }));
    for (const value of [booking.guest, booking.apt, booking.property, booking.phone, booking.ref, money(booking.totalMinor), money(booking.paidMinor), money(booking.outstandingMinor), money(booking.cautionFeeMinor), money(booking.cautionDeductedMinor)]) expect(html).toContain(value);
    expect(html).toContain('23 Oct 2026');
    expect(html).toContain('26 Oct 2026');
    expect(html).toContain('Stay dates · WAT');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Repeat guest');
    expect(html).toContain('3 nights');
  });

  it('preserves revenue, outstanding, caution and in-house arithmetic across booking states', () => {
    const enquiry = { ...booking, id: 'enquiry', ref: 'ENQUIRY', status: 'enquiry', totalMinor: 900009, outstandingMinor: 11111, cautionStatus: 'pending' };
    const inHouse = { ...booking, id: 'in-house', ref: 'IN-HOUSE', status: 'checked_in', totalMinor: 800008, outstandingMinor: 22222, cautionStatus: 'refunded' };
    const html = text(renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [booking, enquiry, inHouse], apartments })));
    expect(html).toContain(`Revenue${money(booking.totalMinor + inHouse.totalMinor)}`);
    expect(html).toContain(`Outstanding${money(booking.outstandingMinor + enquiry.outstandingMinor + inHouse.outstandingMinor)}`);
    expect(html).toContain(`Caution held${money(booking.cautionFeeMinor)}`);
    expect(html).toContain('In-house1');
  });

  it('retains default-denied booking create/payment gates while read-only previews remain available', () => {
    const html = renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [booking], apartments }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?New booking<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Record payment<\/button>/);
    expect(html).toContain('Guest link');
    expect(html).toContain('Receipt');
    expect(source('bookings')).toContain('canCreate && composing');
    expect(source('bookings')).toContain('canUpdate && payFor');
    const checkedOut = { ...booking, status: 'checked_out' };
    expect(renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [checkedOut], apartments }))).not.toContain('href="/shortlet/inspections"');
    expect(renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [checkedOut], apartments, canUpdate: true }))).toContain('href="/shortlet/inspections"');
  });

  it('preserves complete guest-link rules, secure-link limitations and copy error feedback', () => {
    const code = source('bookings');
    expect(code).toContain('b.houseRules.map(');
    expect(code).not.toContain('b.houseRules.slice(');
    expect(code).toContain('Rates are never shown to guests');
    expect(code).toContain('not a verified live, expiring link');
    expect(code).toContain('Copy unavailable. Select the sample URL manually.');
    expect(code).toContain('role="status"');
    expect(code).toContain('WiFi');
    expect(code).toContain('b.wifiPassword');
    expect(code).toContain('b.access');
  });

  it('keeps manual booking/payment values and review/validation safeguards unchanged', () => {
    const code = source('bookings');
    expect(code).toContain('Math.round((Date.parse(co) - Date.parse(ci)) / 86400000)');
    expect(code).toContain('(apt?.rateMinor ?? 0) * nights');
    expect(code).toContain('Math.round(total / 2) / 100');
    expect(code).toContain('recordPayment(booking.id, Number(amt))');
    expect(code).toContain('Math.round(Number(amt) * 100) > booking.outstandingMinor');
    expect(code).toContain("const [amt, setAmt] = useState('')");
    expect(code).toContain('saving does not charge, verify or refund money');
    expect(code).toContain('not proof of a verified gateway payment or bank settlement');
    for (const label of ['Guest name *', 'Phone (WhatsApp)', 'Email', 'Apartment *', 'Check-in *', 'Check-out *', 'Amount paid (₦)', 'Caution fee (₦) *', 'Special requests', 'Amount received (₦)']) expect(code).toContain(`aria-label="${label}"`);
  });

  it('keeps the calendar geometry, period buttons, filters and keyboard scroll regions', () => {
    const html = renderToStaticMarkup(createElement(CalendarWorkspace, { apartments, bookings: [calBooking], nowMs }));
    expect(html).toContain('aria-label="Apartment booking calendar, horizontally scrollable"');
    expect(html).toContain('aria-label="Recorded stays in the calendar period"');
    expect(html.match(/tabindex="0"/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Previous calendar period');
    expect(html).toContain('Next calendar period');
    expect(html).toContain('Snapshot date');
    expect(html).toContain('Calendar period length');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('min-width:766px');
    expect(source('calendar')).toContain('150 + days * 44');
    expect(source('calendar')).toContain('gridColumn: `span ${c.span}`');
    expect(source('calendar')).toContain('setStart((s) => s - days * DAY)');
    expect(source('calendar')).toContain('setStart((s) => s + days * DAY)');
  });

  it('shows full calendar guests and apartment names, including every overlapping stay in the register', () => {
    const overlap = { ...calBooking, id: 'overlap', ref: 'OVERLAP-RECORD', guestName: 'Another Complete Guest Name' };
    const cancelled = { ...calBooking, id: 'cancelled', ref: 'CANCELLED-RECORD', status: 'cancelled' as const };
    const html = renderToStaticMarkup(createElement(CalendarWorkspace, { apartments, bookings: [calBooking, overlap, cancelled], nowMs }));
    expect(html).toContain(`aria-label="View booking ${booking.ref} for ${booking.guest}"`);
    expect(html).toContain(`<td>${booking.guest}</td>`);
    expect(html).toContain(`<td>${overlap.guestName}</td>`);
    expect(html).toContain(`<td>${overlap.ref}</td>`);
    expect(html).not.toContain('CANCELLED-RECORD');
    expect(html).toContain(booking.property);
    expect(html.match(/scope="col"/g)).toHaveLength(8);
    expect(source('calendar')).not.toContain("guestName.split(' ')[0]");
    expect(source('calendar')).toContain('calendarBars(bookings, a.id, start, days).map((b) => b.bookingId)');
  });

  it('keeps calendar exports and status guidance honest about snapshots and provider availability', () => {
    const html = renderToStaticMarkup(createElement(CalendarWorkspace, { apartments, bookings: [calBooking], nowMs }));
    expect(html).toContain('not a live channel check');
    expect(html).toContain('WAT operating dates');
    expect(html).toContain('23 Oct 2026');
    expect(html).toContain('Export all recorded non-cancelled bookings, across all apartments');
    expect(source('calendar')).toContain("if (b.status === 'cancelled') continue");
    expect(source('calendar')).toContain('DTSTART;VALUE=DATE:');
    expect(source('calendar')).toContain('DTEND;VALUE=DATE:');
  });

  it('retains complete awaiting-inspection facts and the exact update gate', () => {
    const html = renderToStaticMarkup(createElement(InspectionsWorkspace, { pending: [pending], done: [] }));
    for (const value of [booking.guest, booking.apt, booking.property, booking.ref, money(booking.cautionFeeMinor)]) expect(html).toContain(value);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Run inspection<\/button>/);
    expect(html).toContain('They do not transfer a refund');
    expect(html).toContain('Durable evidence storage and photo upload are not connected');
  });

  it('renders completed inspection outcomes and exact deductions with a human WAT timestamp', () => {
    const html = renderToStaticMarkup(createElement(InspectionsWorkspace, { pending: [], done: [completed] }));
    expect(html).toContain('24 Oct 2026');
    expect(html).toContain('00:30');
    expect(html).toContain('WAT');
    expect(html).toContain(money(completed.damageMinor));
    expect(html).toContain(money(booking.cautionFeeMinor));
    expect(html).toContain('Damage Recorded');
    expect(html).toContain('1 issue(s)');
    expect(html).toContain('no bank transfer verified');
    expect(html).toContain('Dispute pack');
  });

  it('keeps an unmatched completed inspection visible without inventing zero caution or a pending status', () => {
    const unlinked: DoneRow = { ...completed, ref: '', guest: '', cautionFeeMinor: null, cautionStatus: null };
    const html = renderToStaticMarkup(createElement(InspectionsWorkspace, { pending: [], done: [unlinked] }));
    expect(html).toContain('Booking not linked');
    expect(html).toContain('Guest not available');
    expect(html).toContain('Not available');
    expect(html).toContain('var(--tone-neutral)');
    expect(html).toContain('Recorded damage charge');
    expect(html).toContain(money(unlinked.damageMinor));
    expect(html).toContain('Damage Recorded');
    expect(html).not.toContain('₦0');
    expect(html).not.toContain('Pending');
    expect(html).not.toContain('Full refund recorded');
    expect(html).not.toContain(' deducted');
  });

  it('carries unknown caution through the dispute preview and downloadable text without refund claims', () => {
    const unlinked: DoneRow = { ...completed, bookingId: 'unmatched-booking-reference', ref: ' ', guest: ' ', cautionFeeMinor: null, cautionStatus: null };
    const html = renderToStaticMarkup(createElement(PackModal, { d: unlinked, onClose: () => {} }));
    const exported = inspectionPackText(unlinked);
    for (const content of [html, exported]) {
      expect(content).toContain('Booking not linked');
      expect(content).toContain('Guest not available');
      expect(content).toContain('Not available');
      expect(content).toContain(money(unlinked.damageMinor));
      expect(content).toContain('Damage Recorded');
      expect(content).not.toContain('₦0');
      expect(content).not.toContain('Pending');
      expect(content).not.toContain('refund');
      expect(content).not.toContain('Deducted:');
    }
    expect(exported).toContain('Booking record ID: unmatched-booking-reference');
    expect(exported).toContain('Recorded inspection damage charge:');
    expect(exported).toContain('Caution fee: Not available');
    expect(exported).toContain('original photo evidence not verified');
    expect(source('inspections')).toContain('const lines = inspectionPackText(d)');
  });

  it('keeps a genuine zero caution record distinct from missing booking data', () => {
    const linked: DoneRow = { ...completed, cautionFeeMinor: 0, cautionStatus: 'held' };
    const exported = inspectionPackText(linked);
    expect(exported).toContain(`Caution fee: ${money(0)}`);
    expect(exported).toContain('Caution status: Held');
    expect(exported).not.toContain('Booking not linked');
    expect(exported).not.toContain('Not available');
  });

  it('keeps all checkout item controls labelled, reviewed and explicitly evidence-unverified', () => {
    const code = source('inspections');
    expect(code).toContain('items.map((it, i)');
    expect(code).toContain('aria-label={`Condition for ${it.label}`}');
    expect(code).toContain('aria-pressed={it.condition === c}');
    expect(code).toContain('aria-label={`${it.label} damage note`}');
    expect(code).toContain('aria-label={`${it.label} damage charge in naira`}');
    expect(code).toContain('photo: false');
    expect(code).toContain('saveInspection(booking.id, payload');
    expect(code).toContain('Confirm save & close booking');
    expect(code).toContain('No money moved');
    expect(code).toContain('Photo upload unavailable');
    expect(code).toContain('original photo evidence not verified in this export');
    expect(code).not.toContain('[photo on file]');
  });

  it('keeps full maintenance descriptions and created/resolved facts without date slicing', () => {
    const html = renderToStaticMarkup(createElement(MaintenanceWorkspace, { issues: [issue], apartments, stats: { open: 0, inProgress: 0, resolvedThisMonth: 1 } }));
    expect(text(html)).toContain(issue.title);
    expect(text(html)).toContain(issue.description);
    expect(html).toContain(issue.apt);
    expect(html).toContain('24 Oct 2026');
    expect(html).toContain('00:30');
    expect(html).toContain('11:15');
    expect(html).toContain('Logged · WAT');
    expect(html).toContain('Resolved · WAT');
    expect(html).toContain('0 active · 1 resolved this month');
    expect(source('maintenance')).not.toContain('createdAt.slice(');
  });

  it('keeps maintenance creation/update grants and human-reviewed rule suggestions intact', () => {
    const activeIssue = { ...issue, status: 'open' as const, resolvedAt: undefined };
    const html = renderToStaticMarkup(createElement(MaintenanceWorkspace, { issues: [activeIssue], apartments, stats: { open: 1, inProgress: 0, resolvedThisMonth: 0 } }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Log issue<\/button>/);
    expect(html).toContain('Not resolved');
    expect(source('maintenance')).toContain('ShortletConfirm disabled={!canUpdate}');
    expect(source('maintenance')).toContain('action={() => advanceIssue(i.id)}');
    expect(source('maintenance')).toContain('suggestPriority(title)');
    expect(source('maintenance')).toContain('touched ? priority : suggested ?? priority');
    expect(source('maintenance')).toContain('rules-based title match; review before saving');
    expect(source('maintenance')).toContain('logIssue({ apartmentId: aptId, title, description: desc, priority: effective })');
  });

  it('retains one shared native dialog heading, pending safeguards and visible error feedback', () => {
    const dialog = { title: 'Review checkout', pending: true, onClose: () => {}, children: 'Recorded facts' };
    const html = renderToStaticMarkup(createElement(ShortletDialog, dialog));
    expect(html).toContain('<dialog');
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Close review checkout"');
    expect(html).toContain('aria-busy="true"');
    for (const name of ['bookings', 'inspections', 'maintenance']) {
      const code = source(name);
      expect(code).toContain('pending={pending}');
      expect(code).toContain('if (pending) return');
      expect(code).toContain('role="alert"');
      expect(code).toContain('ShortletReview');
      expect(code).toContain('catch');
      expect(code).not.toContain('pb-dialog-title');
    }
  });

  it('performs no booking, payment, inspection or maintenance writes during QA', () => {
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });
});
