import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertiesPage from '@/app/(ops)/shortlet/properties/page';
import GuestsPage from '@/app/(ops)/shortlet/guests/page';
import ReviewsPage from '@/app/(ops)/shortlet/reviews/page';
import { GuestDirectory } from '@/components/shortlet/guest-directory';
import { ShortletDialog, ShortletMetric, ShortletReview } from '@/components/shortlet/reference-ui';
import { shortletDate, shortletMoney } from '@/components/shortlet/shortlet-format';

const data = vi.hoisted(() => ({ guard: vi.fn(), properties: vi.fn(), apartments: vi.fn(), bookings: vi.fn(), reviews: vi.fn() }));
vi.mock('@/server/guard', () => ({ requireCapability: data.guard }));
vi.mock('@/server/data', () => ({ repos: {
  shortletProperties: { list: data.properties }, shortletApartments: { list: data.apartments },
  shortletBookings: { list: data.bookings }, shortletReviews: { list: data.reviews },
} }));
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const component = (name: string) => read(`src/components/shortlet/${name}.tsx`);
const guests = [
  { name: 'Ngozi Okafor', phone: '+234800000002', stays: 1, lifetimeValueMinor: 100001, lastStayISO: '2026-07-01', repeat: false, vip: false },
  { name: 'Ada Obi', phone: '+234800000001', stays: 3, lifetimeValueMinor: 250002, lastStayISO: '2026-08-15', repeat: true, vip: true },
];
beforeEach(() => {
  vi.clearAllMocks();
  data.guard.mockResolvedValue({ actor: { tenantId: 'tenant-test' } });
  data.properties.mockReturnValue({ items: [{ id: 'property-1', name: 'Lekki Suites', area: 'Lekki Phase 1', city: 'Lagos', bankName: 'Sample Bank', accountName: 'Lekki Suites Limited', accountNumber: '0000000000' }] });
  data.apartments.mockReturnValue({ items: [{ id: 'apartment-1', propertyId: 'property-1', name: 'Penthouse A', type: '2-bed', status: 'active', nightlyRate: { minor: 12000001, currency: 'NGN' }, wifiSsid: 'Guest-network', accessInstructions: 'Call the host and collect the sealed key at the reception desk; do not share the access code.' }] });
  data.bookings.mockReturnValue({ items: [] });
  data.reviews.mockReturnValue({ items: [{ id: 'review-1', apartmentId: 'apartment-1', guestName: 'Ada Obi', atISO: '2026-07-26', rating: 5, comment: 'Comfortable stay <script>not executable</script>', tags: ['Clean', 'Helpful host'] }, { id: 'review-2', apartmentId: 'apartment-1', guestName: 'Ngozi Okafor', atISO: '2026-07-25', rating: 3, comment: 'Helpful team', tags: [] }] });
});

describe('Shortlet directory and shared dialog Clinexa polish', () => {
  it('keeps exact NGN minor units, negative balances and full-year date-only formatting', () => {
    expect(shortletMoney(100001)).toBe('₦1,000.01');
    expect(shortletMoney(0)).toBe('₦0.00');
    expect(shortletMoney(-12345)).toBe('-₦123.45');
    expect(shortletDate('2027-01-05')).toContain('2027');
    expect(shortletDate('2027-01-05')).toContain('Jan');
    expect(shortletDate('Unknown date')).toBe('Unknown date');
  });

  it('uses the real shared KPI header/value pattern and protects long financial values', () => {
    const html = renderToStaticMarkup(createElement(ShortletMetric, { label: 'Recorded revenue', value: '₦29,042,000.01', note: 'Not settled receipts' }));
    expect(html).toContain('kpiHeader');
    expect(html).toContain('kpiValue');
    expect(html).toContain('longMetric');
    expect(html).toContain('₦29,042,000.01');
    expect(html).toContain('Not settled receipts');
    expect(read('src/components/shortlet/shortlet-reference.module.css')).toContain('font-size:clamp(20px,1.8vw,28px)');
    expect(renderToStaticMarkup(createElement(ShortletMetric, { label: 'Caution held', value: '₦811,000.00' }))).toContain('longMetric');
    expect(read('src/components/shortlet/shortlet-reference.module.css')).toContain('min-height:76px');
  });

  it('provides exactly one native modal title and a named disabled close control during saving', () => {
    const props = { title: 'Record payment', pending: true, onClose: vi.fn(), children: 'Record body' };
    const html = renderToStaticMarkup(createElement(ShortletDialog, props));
    expect(html).toContain('<dialog');
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Close record payment"');
    expect(html).toContain('<fieldset disabled="">');
    expect(html).toContain('aria-busy="true"');
    expect(component('reference-ui')).toContain('dismissOnBackdrop={false}');
    expect(read('src/components/shortlet/shortlet-reference.module.css')).toContain('position:sticky');
  });

  it('keeps approval explicit, invalidates stale approval and rejects duplicate confirmation', () => {
    const props = { children: 'Manual record only', pending: false, onSubmit: vi.fn(), onCancel: vi.fn(), label: 'Confirm change' };
    const html = renderToStaticMarkup(createElement(ShortletReview, props));
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*disabled=""[^>]*>Confirm change/);
    for (const event of ['input', 'change', 'click']) expect(component('reference-ui')).toContain(`addEventListener('${event}', invalidate)`);
    expect(component('reference-ui')).toContain('if (inFlight.current) return');
    expect(component('reference-ui')).toContain('finally { inFlight.current = false; }');
  });

  it('shows every guest and their exact value in a named keyboard-scrollable register', () => {
    const html = renderToStaticMarkup(createElement(GuestDirectory, { guests }));
    expect(html.match(/scope="col"/g)).toHaveLength(5);
    expect(html.match(/scope="row"/g)).toHaveLength(2);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Shortlet guest register, horizontally scrollable"');
    for (const guest of guests) { expect(html).toContain(guest.name); expect(html).toContain(guest.phone); }
    expect(html).toContain('₦2,500.02');
    expect(html).toContain('₦1,000.01');
    expect(html.indexOf('Ada Obi')).toBeLessThan(html.indexOf('Ngozi Okafor'));
    expect(html).toContain('aria-label="Search Shortlet guests"');
    expect(html).toContain('aria-label="Guest segment"');
    expect(html).toContain('not verified bank receipts');
  });

  it('provides an honest empty guest state rather than invented examples', () => {
    const html = renderToStaticMarkup(createElement(GuestDirectory, { guests: [] }));
    expect(html).toContain('No guests match');
    expect(html).toContain('Showing 0 of 0 guests');
    expect(html).not.toContain('<tbody>');
  });

  it('keeps property tabs, complete access instructions and native NGN rate details', async () => {
    const html = renderToStaticMarkup(await PropertiesPage());
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html).toContain('₦120,000.01');
    for (const value of ['Lekki Suites Limited', '0000000000', 'Guest-network', 'do not share the access code.', 'Penthouse A', 'Lagos', 'Rules-based nightly-rate illustration']) expect(html).toContain(value);
    expect(html).toContain('not verification of account ownership');
    expect(html).toContain('No apartment or existing booking is repriced automatically');
    expect(read('src/app/(ops)/shortlet/properties/page.tsx')).not.toContain('rec.reasons[0]');
  });

  it('preserves scoped reads behind the original guard on all three directory pages', async () => {
    for (const page of [PropertiesPage, GuestsPage, ReviewsPage]) await page();
    expect(data.guard).toHaveBeenCalledTimes(3);
    expect(data.guard).toHaveBeenCalledWith('bookings_amenities', 'read', 'shortlet');
    expect(data.guard.mock.invocationCallOrder[0]).toBeLessThan(data.properties.mock.invocationCallOrder[0]);
    for (const route of ['properties', 'guests', 'reviews']) {
      const source = read(`src/app/(ops)/shortlet/${route}/page.tsx`);
      expect(source.indexOf('await requireCapability')).toBeLessThan(source.indexOf('repos.'));
      expect(source).not.toContain("from '@/server/actions/");
    }
  });

  it('preserves both guest sections and explains the actual modelled loyalty rules', async () => {
    const html = renderToStaticMarkup(await GuestsPage());
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html).toContain('At least two non-cancelled');
    expect(html).toContain('₦100,000.00');
    expect(html).toContain('permission to send marketing');
  });

  it('keeps all review panels with accessible star counts, exact comments and rating distribution', async () => {
    const html = renderToStaticMarkup(await ReviewsPage());
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/<progress /g)).toHaveLength(5);
    expect(html).toContain('aria-label="5 out of 5 stars"');
    expect(html).toContain('aria-label="5 star reviews: 1 of 2"');
    expect(html).toContain('Comfortable stay &lt;script&gt;not executable&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Helpful host');
    expect(html).toContain('Penthouse A');
    expect(html).toContain('not independently verified');
  });

  it('provides complete empty states in every property/review tab', async () => {
    data.properties.mockReturnValue({ items: [] }); data.apartments.mockReturnValue({ items: [] }); data.reviews.mockReturnValue({ items: [] });
    const properties = renderToStaticMarkup(await PropertiesPage());
    const reviews = renderToStaticMarkup(await ReviewsPage());
    for (const label of ['No shortlet properties', 'No rate suggestions']) expect(properties).toContain(label);
    for (const label of ['No feedback yet', 'There are no review ratings', 'No apartment ratings']) expect(reviews).toContain(label);
    expect(properties + reviews).not.toContain('NaN');
  });

  it('retains the whole overview attention queue and messaging scope instead of silently slicing records', () => {
    expect(read('src/app/(ops)/shortlet/page.tsx')).toContain('attention={attention}');
    expect(read('src/app/(ops)/shortlet/page.tsx')).toContain('guest: bar.guestName,');
    expect(read('src/app/(ops)/shortlet/whatsapp/page.tsx')).not.toContain('.slice(0, 12)');
    expect(read('src/config/nav.ts')).toContain("id: 'sl-pricing', label: 'Seasonal pricing'");
    expect(read('src/app/(ops)/shortlet/channels/page.tsx')).toContain('shortletDate(c.a.checkIn)');
    expect(read('src/app/(ops)/shortlet/whatsapp/page.tsx')).toContain('checkin: shortletDate(sample.checkIn)');
    expect(component('dashboard')).toContain('title={c.guest}');
    expect(read('src/components/shortlet/shortlet-reference.module.css')).toContain('.calendarBar span { font-size:14px;');
  });

  it('uses responsive directory layouts and complete non-colour rating labels', () => {
    const css = read('src/components/shortlet/shortlet-directory-polish.module.css');
    expect(css).toContain('min-width:760px');
    expect(css).toContain('height:64px');
    expect(css).toContain('::-webkit-progress-value');
    expect(css).toContain('::-moz-progress-bar');
    expect(css).toContain('@media(max-width:640px)');
    expect(css).not.toContain('display:none');
  });
});
