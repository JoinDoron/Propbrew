import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AgentsWorkspace } from '@/components/shortlet/agents-workspace';
import { ShortletAnalytics } from '@/components/shortlet/analytics';
import { BookingPageWorkspace } from '@/components/shortlet/booking-page-workspace';
import { BookingsWorkspace } from '@/components/shortlet/bookings-workspace';
import { CalendarWorkspace } from '@/components/shortlet/calendar-workspace';
import { ChannelsWorkspace } from '@/components/shortlet/channels-workspace';
import { ShortletDashboard } from '@/components/shortlet/dashboard';
import { ExpensesWorkspace } from '@/components/shortlet/expenses-workspace';
import { InspectionsWorkspace } from '@/components/shortlet/inspections-workspace';
import { MaintenanceWorkspace } from '@/components/shortlet/maintenance-workspace';
import { PlanWorkspace } from '@/components/shortlet/plan-workspace';
import { PricingWorkspace } from '@/components/shortlet/pricing-workspace';
import { TeamWorkspace } from '@/components/shortlet/team-workspace';
import { WhatsappWorkspace } from '@/components/shortlet/whatsapp-workspace';
import { ShortletCopilotWorkspace } from '@/components/shortlet/copilot-workspace';
import { ShortletDialog, ShortletReview, shortletMoney } from '@/components/shortlet/reference-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/shortlet', () => ({}));

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const source = (name: string) => read(`src/components/shortlet/${name}.tsx`);
const render = <Props extends object>(component: ComponentType<Props>, props: Props) => renderToStaticMarkup(createElement(component, props));
const routes = ['', 'properties', 'calendar', 'bookings', 'guests', 'channels', 'pricing', 'analytics', 'expenses', 'maintenance', 'inspections', 'team', 'reviews', 'agents', 'whatsapp', 'booking-page', 'plan', 'copilot'];
const screens = [
  ['Copilot', 2, () => render(ShortletCopilotWorkspace, { snapshotISO: '2026-07-26T00:00:00Z', suggestions: [] })],
  ['Agents', 2, () => render(AgentsWorkspace, { agents: [] })],
  ['Analytics', 3, () => render(ShortletAnalytics, { revExp: [], propProfit: [], occupancy: [], sources: [] })],
  ['Booking page', 2, () => render(BookingPageWorkspace, { config: { enabled: false, slug: 'lagos', cancellationPolicy: 'Contact host', holdHours: 3, promoCodes: [] }, funnel: { visits: 0, searches: 0, views: 0, enquiries: 0, confirmed: 0, conversionPct: 0 }, aptFunnels: [], preview: [], businessName: 'Lagos Stays' })],
  ['Bookings', 2, () => render(BookingsWorkspace, { bookings: [], apartments: [] })],
  ['Calendar', 2, () => render(CalendarWorkspace, { apartments: [], bookings: [], nowMs: Date.parse('2026-07-26') })],
  ['Channels', 2, () => render(ChannelsWorkspace, { apartments: [], summary: { connections: 0, apartmentsSynced: 0, byChannel: [] }, conflicts: [], lastSync: 'Not connected' })],
  ['Overview', 4, () => render(ShortletDashboard, { kpis: { revenueMinor: 0, profitMinor: 0, occupancyPct: 0, bookings: 0, cautionHeldMinor: 0 }, monthLabel: 'July 2026', arrivals: [], departures: [], staying: [], calendar: [], days: [], revExp: [], attention: [] })],
  ['Expenses', 2, () => render(ExpensesWorkspace, { expenses: [], properties: [], insight: { totalMinor: 0, dieselPctOfRevenue: 0, costPerOccupiedNightMinor: 0, byCategory: [] }, revenueMinor: 0 })],
  ['Inspections', 2, () => render(InspectionsWorkspace, { pending: [], done: [] })],
  ['Maintenance', 2, () => render(MaintenanceWorkspace, { issues: [], apartments: [], stats: { open: 0, inProgress: 0, resolvedThisMonth: 0 } })],
  ['Plan', 2, () => render(PlanWorkspace, { plans: [], currentKey: 'lite', apartmentCount: 0, recommendation: { key: 'lite', reasons: [] }, order: ['lite'] })],
  ['Pricing', 2, () => render(PricingWorkspace, { apartments: [] })],
  ['Team', 2, () => render(TeamWorkspace, { members: [], roles: [], modules: [], matrix: {} })],
  ['WhatsApp', 3, () => render(WhatsappWorkspace, { stats: { sent: 0, scheduled: 0, delivered: 0, read: 0 }, templates: [], sampleVars: {}, timeline: [] })],
] as const;

describe('Shortlet complete Clinexa composition', () => {
  it.each(routes)('retains scoped module authorization for /shortlet/%s', (route) => {
    const page = read(`src/app/(ops)/shortlet/${route ? `${route}/` : ''}page.tsx`);
    expect(page).toContain("requireCapability('bookings_amenities', 'read', 'shortlet')");
    if (route === 'copilot') {
      expect(page).toContain('<ShortletCopilotWorkspace');
      expect(source('copilot-workspace')).toContain('<CopilotSummary');
      return;
    }
    expect(page.indexOf('await requireCapability')).toBeLessThan(page.indexOf('repos.'));
    expect(page).toContain('<PageHeader');
  });

  it.each(screens)('keeps every %s panel mounted (%i sections)', (_label, count, screen) => {
    const html = screen();
    expect(html.match(/role="tabpanel"/g)).toHaveLength(count);
    expect(html.match(/hidden=""/g)).toHaveLength(count - 1);
    expect(html).not.toContain('pb-hero');
    expect(html).not.toContain('fixed inset-0');
    expect(html).not.toContain('NaN');
  });

  it('uses native modal semantics and blocks dismissal and duplicate controls while saving', () => {
    const html = render(ShortletDialog, { title: 'Review record', pending: true, onClose: vi.fn(), children: 'Record details' });
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Review record"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('<fieldset disabled="">');
    expect(source('reference-ui')).toContain('canClose={!pending}');
    expect(source('reference-ui')).toContain('if (pending) return');
  });

  it('requires explicit review and invalidates approval when details change', () => {
    const html = render(ShortletReview, { children: 'Manual financial record only', pending: false, onCancel: vi.fn(), onSubmit: vi.fn(), label: 'Confirm record' });
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Confirm record<\/button>/);
    const ui = source('reference-ui');
    expect(ui).toContain("addEventListener('input', invalidate)");
    expect(ui).toContain("addEventListener('change', invalidate)");
    expect(ui).toContain('role="alert"');
  });

  it('keeps money exact to kobo and never compacts a financial balance', () => {
    expect(shortletMoney(100001)).toContain('1,000.01');
    expect(shortletMoney(0)).toContain('0');
    expect(shortletMoney(-12345)).toContain('123.45');
    expect(source('dashboard')).not.toContain('Math.round(n / 1e3)');
    expect(source('bookings-workspace')).toContain('Math.round(Number(amt) * 100) > booking.outstandingMinor');
    expect(source('bookings-workspace')).toContain("const [amt, setAmt] = useState('')");
  });

  it('does not manufacture channel synchronisation, WhatsApp delivery, traffic or subscription payment', () => {
    expect(source('channels-workspace')).toContain('Live sync unavailable');
    expect(source('channels-workspace')).not.toContain('All channels synced just now');
    expect(source('whatsapp-workspace')).toContain('modelled illustrations');
    expect(source('whatsapp-workspace')).toContain('not provider callbacks');
    expect(source('booking-page-workspace')).toContain('not measured visits');
    expect(source('plan-workspace')).toContain('not a connected subscription checkout');
    expect(source('plan-workspace')).not.toContain('prorated to today');
  });

  it('never treats a damage state as uploaded evidence or a bank refund', () => {
    const inspections = source('inspections-workspace');
    expect(inspections).toContain('photo: false');
    expect(inspections).toContain('No money moved');
    expect(inspections).not.toContain('[photo on file]');
    expect(inspections).toContain('ShortletReview');
  });

  it('preserves specialist calendar geometry with named keyboard-scroll regions and legible booking targets', () => {
    const calendar = source('calendar-workspace');
    expect(calendar).toContain('150 + days * 44');
    expect(calendar).toContain('gridColumn: `span ${c.span}`');
    expect(calendar).toContain('aria-label="Apartment booking calendar, horizontally scrollable"');
    expect(calendar).toContain('tabIndex={0}');
    expect(calendar).toContain('Snapshot date');
    expect(read('src/components/shortlet/shortlet-reference.module.css')).toContain('min-height:64px');
    expect(read('src/components/shortlet/shortlet-reference.module.css')).toContain('@media(max-width:640px)');
  });

  it('imports server-rendered layout tokens directly so the grid survives the RSC boundary', () => {
    expect(source('dashboard')).toContain("import shortletStyles from './shortlet-reference.module.css'");
    expect(source('dashboard')).not.toContain("import { shortletStyles } from './reference-ui'");
    for (const route of ['guests', 'properties', 'reviews']) {
      const page = read(`src/app/(ops)/shortlet/${route}/page.tsx`);
      expect(page).toContain("import shortletStyles from '@/components/shortlet/shortlet-reference.module.css'");
      expect(page).not.toMatch(/import \{[^}]*shortletStyles[^}]*\} from '[^']*reference-ui'/);
    }
  });

  it('keeps create and update controls default denied and maps them to server action verbs', () => {
    for (const [route, verb] of [['agents', 'create'], ['expenses', 'create'], ['team', 'update'], ['pricing', 'update'], ['plan', 'update'], ['inspections', 'update']] as const) {
      expect(read(`src/app/(ops)/shortlet/${route}/page.tsx`)).toContain(`can(actor, 'bookings_amenities', '${verb}').allowed`);
    }
    const html = render(AgentsWorkspace, { agents: [] });
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>[\s\S]*?Invite agent/);
    expect(source('team-workspace')).toContain('ShortletConfirm disabled={!canUpdate}');
    expect(source('pricing-workspace')).toContain('ShortletConfirm disabled={!canUpdate}');
  });

  it('labels team permissions honestly and requires reviewed changes rather than mutating on select', () => {
    const team = source('team-workspace');
    expect(team).toContain('does not provision accounts');
    expect(team).toContain('Proposed role for');
    expect(team).toContain('setSelected(event.target.value)');
    expect(team).toContain('action={() => setMemberRole');
    expect(team).toContain('aria-label="Shortlet role permission reference table"');
  });

  it('exports explicit NGN columns and safely quotes user-facing labels', () => {
    const analytics = source('analytics');
    expect(analytics).toContain('revenue_ngn,expense_ngn,profit_ngn');
    expect(analytics).toContain("replaceAll('\"', '\"\"')");
    expect(analytics).not.toContain('minHeight: 2');
  });
});
