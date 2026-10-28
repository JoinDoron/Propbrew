import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ShortletDashboard, type Move } from '@/components/shortlet/dashboard';
import { ShortletAnalytics } from '@/components/shortlet/analytics';
import { PricingWorkspace, type AptRow } from '@/components/shortlet/pricing-workspace';
import { ExpensesWorkspace, type ExpenseRow } from '@/components/shortlet/expenses-workspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/shortlet', () => ({ addPricingRule: vi.fn(), removePricingRule: vi.fn(), logExpense: vi.fn() }));

const render = <Props extends object>(component: ComponentType<Props>, props: Props) => renderToStaticMarkup(createElement(component, props));
const source = (name: string) => readFileSync(resolve(process.cwd(), `src/components/shortlet/${name}.tsx`), 'utf8');
const css = () => readFileSync(resolve(process.cwd(), 'src/components/shortlet/shortlet-commercial-polish.module.css'), 'utf8');
const dashboard = { kpis: { revenueMinor: 12500001, profitMinor: -10001, occupancyPct: 72.5, bookings: 7, cautionHeldMinor: 8800001 }, monthLabel: 'July 2026', arrivals: [] as Move[], departures: [] as Move[], staying: [] as Move[], calendar: [], days: [], revExp: [], attention: [] };
const apartment: AptRow = { id: 'apt-lekki', name: 'Lekki Courtyard 301', property: 'Ikate House', baseMinor: 6500001, rules: [{ id: 'peak', label: 'Festive peak', type: 'increase', pct: 25, fromISO: '2026-12-15', toISO: '2027-01-05' }] };
const expense: ExpenseRow = { id: 'EXP-LAGOS-1', propertyId: 'property-1', property: 'Ikate House', category: 'diesel', amountMinor: 1234567, date: '2026-07-26', note: 'Generator refill · supplier receipt pending verification, no settlement evidence attached' };
const insight = { totalMinor: 1234567, dieselPctOfRevenue: 12.35, costPerOccupiedNightMinor: 432109, byCategory: [{ category: 'diesel', minor: 1234567, pct: 100 }] };
const properties = [{ id: 'property-1', name: 'Ikate House' }];

describe('Shortlet commercial Clinexa inner composition', () => {
  it.each([
    ['overview', 4, () => render(ShortletDashboard, dashboard)],
    ['analytics', 3, () => render(ShortletAnalytics, { revExp: [], propProfit: [], occupancy: [], sources: [] })],
    ['pricing', 2, () => render(PricingWorkspace, { apartments: [] })],
    ['expenses', 2, () => render(ExpensesWorkspace, { expenses: [], properties: [], insight: { totalMinor: 0, dieselPctOfRevenue: 0, costPerOccupiedNightMinor: 0, byCategory: [] }, revenueMinor: 0 })],
  ] as const)('preserves all %s panels mounted (%i)', (_screen, count, draw) => {
    const html = draw();
    expect(html.match(/role="tabpanel"/g)).toHaveLength(count);
    expect(html.match(/hidden=""/g)).toHaveLength(count - 1);
    expect(html).not.toContain('NaN');
  });

  it('shows every movement, including those beyond four, with reference, apartment and source', () => {
    const arrivals = Array.from({ length: 7 }, (_, index) => ({ ref: `SL-FULL-${index}`, guest: `Guest number ${index}`, apt: `Apartment ${index}`, source: `Agent source ${index}` }));
    const html = render(ShortletDashboard, { ...dashboard, arrivals });
    expect(html).toContain('Live activity');
    expect(html).toContain('Today’s recorded guest movement and in-house register');
    for (const arrival of arrivals) for (const fact of Object.values(arrival)) expect(html).toContain(fact);
    expect(source('dashboard')).not.toContain('activityRows.slice');
    expect(html.match(/>Arrival<\/span>/g)).toHaveLength(arrivals.length);
  });

  it('retains exact recorded KPI balances and truthful liability and settlement labels', () => {
    const html = render(ShortletDashboard, dashboard);
    expect(html).toContain('₦125,000.01');
    expect(html).toContain('-₦100.01');
    expect(html).toContain('₦88,000.01');
    expect(html).toContain('not verified bank settlement');
    expect(html).toContain('caution is a recorded liability');
    expect(css()).toContain('grid-template-columns:repeat(5,minmax(0,1fr))');
    expect(source('dashboard')).toContain("from './shortlet-format'");
    expect(source('dashboard')).not.toContain("import { shortletStyles } from './reference-ui'");
    expect(source('dashboard')).toContain('<ShortletMetric label="Recorded revenue"');
  });

  it('keeps booking-span geometry and property facts with a non-live availability explanation', () => {
    const html = render(ShortletDashboard, { ...dashboard, days: ['Sun 26', 'Mon 27', 'Tue 28'], calendar: [{ apt: 'Apartment 301', property: 'Ikate House complete property name', cells: [{ guest: 'Ada Okafor full guest name', tone: 'info', span: 2 }, null, null] }] });
    expect(html).toContain('grid-column:span 2');
    expect(html).toContain('aria-label="Next seven nights apartment occupancy calendar"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Ikate House complete property name');
    expect(html).toContain('Ada Okafor full guest name');
    expect(html).toContain('No recorded booking');
    expect(html).toContain('does not guarantee availability');
    expect(html).not.toContain('No occupancy calendar records');
  });

  it('adds readable exact monthly values including profit rather than chart-only finance', () => {
    const html = render(ShortletDashboard, { ...dashboard, revExp: [{ label: 'July 2026', revenueMinor: 20000001, expenseMinor: 12345678, profitMinor: 7654323 }] });
    expect(html).toContain('aria-label="Exact monthly revenue, expenses and profit values"');
    expect(html).toContain('₦200,000.01');
    expect(html).toContain('₦123,456.78');
    expect(html).toContain('₦76,543.23');
    expect(html.match(/scope="col"/g)).toHaveLength(4);
    expect(html).toContain('scope="row"');
  });

  it('preserves complete attention content and gives honest empty-state explanations', () => {
    const title = 'Follow up on the complete outstanding accommodation balance and inspection details';
    const html = render(ShortletDashboard, { ...dashboard, attention: [{ kind: 'balance', title, sub: 'SL-42 · Ada · Ikate House · ₦123,456.78 outstanding', href: '/shortlet/bookings' }] });
    expect(html).toContain(title);
    expect(html).toContain('href="/shortlet/bookings"');
    expect(html).toContain('operational guidance, not live monitoring');
    const empty = render(ShortletDashboard, dashboard);
    for (const text of ['No occupancy calendar records', 'No attention items recorded', 'No revenue or expense history']) expect(empty).toContain(text);
  });

  it('shows all analytics source, property and occupancy facts with exact NGN', () => {
    const html = render(ShortletAnalytics, { revExp: [{ label: 'July 2026', revenueMinor: 32100001, expenseMinor: 12300002 }], propProfit: [{ name: 'Ikate House', revenueMinor: 32100001, expenseMinor: 12300002, profitMinor: 19799999, marginPct: 61.68 }], occupancy: [{ name: 'Courtyard 301', property: 'Ikate House', occupancyPct: 72.5 }], sources: [{ label: 'Lagos partner network', bookings: 11, revenueMinor: 7654321, nights: 39 }] });
    for (const text of ['₦321,000.01', '₦123,000.02', '₦197,999.99', '61.68%', '72.5% occupied', 'Courtyard 301', 'Lagos partner network', '₦76,543.21', '<dt>Booked nights</dt><dd>39</dd>', '<dt>Bookings</dt><dd>11</dd>']) expect(html).toContain(text);
    expect(html).toContain('Exact monthly finance values, horizontally scrollable');
    expect(html).toContain('not live channel availability');
    expect(html).toContain('not a connected channel performance feed');
    expect(source('analytics')).toContain('revenue_ngn,expense_ngn,profit_ngn');
    expect(source('analytics')).toContain("replaceAll('\"', '\"\"')");
  });

  it('does not render invented empty analytics bars', () => {
    const html = render(ShortletAnalytics, { revExp: [], propProfit: [], occupancy: [], sources: [] });
    for (const title of ['No finance history', 'No property finance records', 'No apartment occupancy', 'No booking sources']) expect(html).toContain(title);
    expect(html).not.toContain('role="img"');
  });

  it('shows full cross-year pricing dates, exact rule calculations and first-match semantics', () => {
    const html = render(PricingWorkspace, { apartments: [apartment] });
    expect(html).toContain('₦65,000.01');
    expect(html).toContain('₦81,250.01');
    expect(html).toContain('15 Dec 2026');
    expect(html).toContain('5 Jan 2027');
    expect(html).toContain('dateTime="2026-12-15"');
    expect(html).toContain('Through, inclusive');
    expect(html).toContain('first matching rule');
    expect(html).toContain('including weekdays');
    expect(html).toContain('no automatic or AI-driven rate changes');
  });

  it('makes all 30 rate illustrations available as keyboard-readable exact daily facts', () => {
    const html = render(PricingWorkspace, { apartments: [{ ...apartment, rules: [{ id: 'august', label: 'August operating adjustment', type: 'fixed', amountMinor: 5000001, fromISO: '2026-08-01', toISO: '2026-08-15' }] }] });
    expect(html).toContain('<details>');
    expect(html).toContain('View all 30 nightly rate calculations');
    expect(html).toContain('1 Aug 2026');
    expect(html).toContain('30 Aug 2026');
    expect(html).toContain('₦50,000.01');
    expect(html).toContain('August operating adjustment');
    expect(html).toContain('Bars use a relative scale');
    expect(html).toContain('not a demand forecast or live channel quote');
    const flat = render(PricingWorkspace, { apartments: [{ ...apartment, rules: [] }] });
    expect(flat).toContain('All 30 nights use ₦65,000.01 per night.');
    expect(flat).toContain('No seasonal pricing rules');
    const allFixed = render(PricingWorkspace, { apartments: [{ ...apartment, rules: [{ id: 'all-august', label: 'August fixed price', type: 'fixed', amountMinor: 5000001, fromISO: '2026-08-01', toISO: '2026-08-30' }] }] });
    expect(allFixed).toContain('All 30 nights use ₦50,000.01 per night.');
  });

  it('keeps pricing grants default-denied and preserves review-protected actions', () => {
    const html = render(PricingWorkspace, { apartments: [apartment] });
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>[\s\S]*?Add rule<\/button>/);
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Remove Festive peak<\/button>/);
    const pricing = source('pricing-workspace');
    expect(pricing).toContain('ShortletConfirm disabled={!canUpdate}');
    expect(pricing).toContain('action={() => removePricingRule(r.id)}');
    expect(pricing).toContain('canCreate && addFor');
    expect(pricing).toContain('(apt.baseMinor / 100).toFixed(2)');
    expect(pricing).not.toContain('Math.round(apt.baseMinor / 100)');
  });

  it('keeps all six expense register facts readable in a named local scrolling table', () => {
    const html = render(ExpensesWorkspace, { expenses: [expense], properties, insight, revenueMinor: 10000000 });
    expect(html.match(/scope="col"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Expense ledger, horizontally scrollable"');
    expect(html).toContain('tabindex="0"');
    for (const text of ['EXP-LAGOS-1', '26 Jul 2026', 'Ikate House', 'diesel', expense.note, '₦12,345.67']) expect(html).toContain(text);
    expect(html).toContain('dateTime="2026-07-26"');
    expect(html).toContain('logging is not a bank payment');
    expect(html).not.toContain('max-h-[420px]');
    expect(html).toContain('ledger property filter does not change these totals');
  });

  it('uses truthful spending empty states and does not invent zero-denominator margins', () => {
    const html = render(ExpensesWorkspace, { expenses: [], properties: [], insight: { totalMinor: 0, dieselPctOfRevenue: 0, costPerOccupiedNightMinor: 0, byCategory: [] }, revenueMinor: 0 });
    for (const text of ['No matching expenses', 'No spending categories', 'Margin unavailable: no recorded revenue', 'No recorded revenue denominator']) expect(html).toContain(text);
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>[\s\S]*?Log expense<\/button>/);
  });

  it('keeps native form validation, explicit reviews, pending/error protection and one shared modal title', () => {
    for (const name of ['pricing-workspace', 'expenses-workspace']) {
      const file = source(name);
      expect(file).toContain('form.current?.reportValidity()');
      expect(file).toContain('pending || inFlight.current || !valid');
      expect(file).toContain('finally { inFlight.current = false; }');
      expect(file).toContain('pending={pending}');
      expect(file).toContain('ShortletReview pending={pending} disabled={!valid}');
      expect(file).toContain('role="alert"');
      expect(file).toContain('required type="number" min="0.01" step="0.01"');
      expect(file).not.toContain('pb-dialog-title');
      expect(file).not.toContain('aria-label="Close dialog"');
    }
    expect(source('expenses-workspace')).toContain('logExpense({ propertyId: propId, category, amountNaira: Number(amount), date, note })');
    expect(source('pricing-workspace')).toContain('addPricingRule({ apartmentId: apt.id, label, fromISO: from, toISO: to, type, amountNaira: Number(amount), pct: Number(pct) })');
  });

  it('provides local 16/14/12px patterns, 24/16px spacing and 40/44px control targets', () => {
    const styles = css();
    for (const token of ['font-size:16px', 'font-size:14px', 'font-size:12px', 'gap:24px', 'gap:16px', 'min-height:40px', 'min-height:44px', '@media(max-width:640px)', '@media(pointer:coarse)', 'padding:18px 16px', 'background:var(--surface-2)']) expect(styles).toContain(token);
    for (const file of ['dashboard', 'analytics', 'pricing-workspace', 'expenses-workspace']) expect(source(file)).toContain('shortlet-commercial-polish.module.css');
  });
});
