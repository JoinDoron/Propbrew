import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
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
import { OperationsControlWorkspace } from '@/components/shortlet/operations-control-workspace';
import { ShortletDialog } from '@/components/shortlet/reference-ui';
import primitives from '@/components/ui/primitives.module.css';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/shortlet', () => ({}));
vi.mock('@/server/actions/shortlet-control', () => ({
  approveShortletTransaction: vi.fn(), assignTurnover: vi.fn(), decideShortletApproval: vi.fn(),
  generateTurnoverTasks: vi.fn(), matchShortletTransaction: vi.fn(), reviewGuestVerification: vi.fn(),
  submitGuestVerification: vi.fn(), submitShortletTransaction: vi.fn(), updateTurnover: vi.fn(),
}));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const component = (name: string) => read(`src/components/shortlet/${name}.tsx`);
const routes = ['', 'agents', 'analytics', 'booking-page', 'bookings', 'calendar', 'channels', 'expenses', 'guests', 'inspections', 'maintenance', 'operations', 'plan', 'pricing', 'properties', 'reviews', 'team', 'whatsapp', 'copilot'];
const cases = [
  { name: 'Copilot', panels: 2, render: () => renderToStaticMarkup(createElement(ShortletCopilotWorkspace, { snapshotISO: '2026-07-26T00:00:00Z', suggestions: [] })) },
  { name: 'Agents', panels: 2, render: () => renderToStaticMarkup(createElement(AgentsWorkspace, { agents: [] })) },
  { name: 'Analytics', panels: 3, render: () => renderToStaticMarkup(createElement(ShortletAnalytics, { revExp: [], propProfit: [], occupancy: [], sources: [] })) },
  { name: 'Direct booking page', panels: 2, render: () => renderToStaticMarkup(createElement(BookingPageWorkspace, { config: { enabled: false, slug: 'lekki', cancellationPolicy: 'Contact host', holdHours: 3, promoCodes: [] }, funnel: { visits: 0, searches: 0, views: 0, enquiries: 0, confirmed: 0, conversionPct: 0 }, aptFunnels: [], preview: [], businessName: 'Lagos Stays' })) },
  { name: 'Bookings', panels: 2, render: () => renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [], apartments: [] })) },
  { name: 'Calendar', panels: 2, render: () => renderToStaticMarkup(createElement(CalendarWorkspace, { apartments: [], bookings: [], nowMs: Date.parse('2026-07-26') })) },
  { name: 'Channels', panels: 2, render: () => renderToStaticMarkup(createElement(ChannelsWorkspace, { apartments: [], summary: { connections: 0, apartmentsSynced: 0, byChannel: [] }, conflicts: [], lastSync: 'Not connected' })) },
  { name: 'Overview', panels: 4, render: () => renderToStaticMarkup(createElement(ShortletDashboard, { kpis: { revenueMinor: 0, profitMinor: 0, occupancyPct: 0, bookings: 0, cautionHeldMinor: 0 }, monthLabel: 'July 2026', arrivals: [], departures: [], staying: [], calendar: [], days: [], revExp: [], attention: [] })) },
  { name: 'Expenses', panels: 2, render: () => renderToStaticMarkup(createElement(ExpensesWorkspace, { expenses: [], properties: [], insight: { totalMinor: 0, dieselPctOfRevenue: 0, costPerOccupiedNightMinor: 0, byCategory: [] }, revenueMinor: 0 })) },
  { name: 'Checkout inspections', panels: 2, render: () => renderToStaticMarkup(createElement(InspectionsWorkspace, { pending: [], done: [] })) },
  { name: 'Maintenance', panels: 2, render: () => renderToStaticMarkup(createElement(MaintenanceWorkspace, { issues: [], apartments: [], stats: { open: 0, inProgress: 0, resolvedThisMonth: 0 } })) },
  { name: 'Operations', panels: 4, render: () => renderToStaticMarkup(createElement(OperationsControlWorkspace, { bookings: [], transactions: [], turnovers: [], members: [], approvals: [], canCreate: false, canUpdate: false })) },
  { name: 'Plan', panels: 2, render: () => renderToStaticMarkup(createElement(PlanWorkspace, { plans: [{ key: 'lite', name: 'Lite', priceMonthlyMinor: 0, apartmentCap: 1, entitlements: ['Bookings'] }], currentKey: 'lite', apartmentCount: 0, recommendation: { key: 'lite', reasons: [] }, order: ['lite'] })) },
  { name: 'Pricing', panels: 2, render: () => renderToStaticMarkup(createElement(PricingWorkspace, { apartments: [] })) },
  { name: 'Team', panels: 2, render: () => renderToStaticMarkup(createElement(TeamWorkspace, { members: [], roles: [], modules: [], matrix: {} })) },
  { name: 'WhatsApp', panels: 3, render: () => renderToStaticMarkup(createElement(WhatsappWorkspace, { stats: { sent: 0, scheduled: 0, delivered: 0, read: 0 }, templates: [], sampleVars: {}, timeline: [] })) },
];

describe('Complete Shortlet Clinexa design coverage', () => {
  it.each(routes)('uses fluid shared page framing and preserves the guard for /shortlet/%s', (route) => {
    const page = read(`src/app/(ops)/shortlet/${route ? `${route}/` : ''}page.tsx`);
    if (route === 'copilot') {
      expect(page).toContain("requireCapability('bookings_amenities', 'read', 'shortlet')");
      expect(page).toContain('<div className="pb-page"><ShortletCopilotWorkspace');
      expect(component('copilot-workspace')).toContain('<CopilotSummary');
      return;
    }
    expect(page).toContain("import { PageHeader } from '@/components/ui/page-header'");
    expect(page).toMatch(/return\s*\(?\s*<div className="pb-page">\s*<PageHeader/);
    expect(page).toContain("requireCapability('bookings_amenities', 'read', 'shortlet')");
    expect(page.indexOf('await requireCapability')).toBeLessThan(page.indexOf('repos.'));
  });

  it.each(cases)('keeps all $name tab panels and the shared section rhythm', ({ render, panels }) => {
    const html = render();
    expect(html).toContain(primitives.card);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(panels);
    expect(html).toContain('role="tablist"');
    expect(html).not.toContain('<style>');
  });

  it('covers every existing Shortlet page and client component, excluding only the layout contract', () => {
    const root = resolve(process.cwd(), 'src/app/(ops)/shortlet');
    const actual = ['', ...readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)].filter((route) => {
      try { return read(`src/app/(ops)/shortlet/${route ? `${route}/` : ''}page.tsx`).length > 0; } catch { return false; }
    });
    expect([...actual].sort()).toEqual([...routes].sort());
    const components = readdirSync(resolve(process.cwd(), 'src/components/shortlet')).filter((name) => name.endsWith('.tsx'));
    expect(components.filter((name) => !['reference-ui.tsx', 'guest-directory.tsx', 'accommodation-editor.tsx'].includes(name))).toHaveLength(cases.length);
    expect(component('accommodation-editor')).toContain('ShortletDialog');
    expect(components).toContain('reference-ui.tsx');
    expect(components).toContain('guest-directory.tsx');
    const serverPanels = ['guests', 'properties', 'reviews'].reduce((count, route) => count + (read(`src/app/(ops)/shortlet/${route}/page.tsx`).match(/id: ["']/g)?.length ?? 0), 0);
    expect(cases.reduce((count, screen) => count + screen.panels, 0) + serverPanels).toBe(45);
  });

  it('uses shared form, dialog and action patterns instead of leaking legacy form styles', () => {
    for (const name of ['agents-workspace', 'bookings-workspace', 'booking-page-workspace', 'expenses-workspace', 'maintenance-workspace', 'pricing-workspace', 'team-workspace']) {
      const view = component(name);
      expect(view).toMatch(/pb-form-label|<label/);
      expect(view).toMatch(/pb-form-control|className=\{styles.control\}|className=\{styles.field\}/);
      expect(view).not.toContain('pb-dialog-title');
      expect(view).not.toContain('aria-label="Close dialog"');
      expect(view).toContain('ShortletDialog');
      expect(view).not.toContain('fixed inset-0');
      expect(view).not.toContain('<style>');
      expect(view).not.toMatch(/className="(?:lbl|inp)[0-9abcmp]*[ "]/);
    }
    const dialogProps = { title: 'Review Shortlet record', onClose: vi.fn(), children: 'Details' };
    const dialog = renderToStaticMarkup(createElement(ShortletDialog, dialogProps));
    expect(dialog).toContain('<dialog');
    expect(dialog.match(/<h2/g)).toHaveLength(1);
    expect(dialog).toContain('aria-label="Close review shortlet record"');
  });

  it('uses rectangular pressed-state filters without changing calendar geometry', () => {
    for (const name of ['bookings-workspace', 'calendar-workspace', 'maintenance-workspace']) {
      const view = component(name);
      expect(view).toMatch(/pb-register-toolbar|className=\{styles.toolbar\}/);
      expect(view).toMatch(/pb-filter|<Button[^>]*aria-pressed/);
      expect(view).toContain('aria-pressed=');
      expect(view).not.toMatch(/h-8[^\n`"]*rounded-full/);
    }
    const calendar = component('calendar-workspace');
    expect(calendar).toContain('150 + days * 44');
    expect(calendar).toContain('gridColumn: `span ${c.span}`');
    expect(calendar).toContain('className={styles.calendarBar}');
    expect(calendar).not.toContain('font-medium truncate');
    expect(calendar).toContain('Stays in this period');
    expect(calendar).toContain('aria-label="Previous calendar period"');
    expect(calendar).toContain('aria-label="Next calendar period"');
    expect(calendar).toContain('aria-label="Filter calendar by apartment"');
  });

  it('preserves cautious financial and manual pricing workflows', () => {
    const bookings = component('bookings-workspace');
    expect(bookings).toContain('recordPayment(booking.id, Number(amt))');
    expect(bookings).toContain('b.outstandingMinor > 0');
    expect(bookings).toContain('href="/shortlet/inspections"');
    expect(bookings).toContain('Rates are never shown to guests');
    const inspections = component('inspections-workspace');
    expect(inspections).toContain('saveInspection(booking.id, payload');
    expect(inspections).toContain('Caution decision:');
    expect(inspections).toContain('Dispute evidence pack');
    expect(inspections).toContain('aria-label={`${it.label} damage charge in naira`}');
    const pricing = component('pricing-workspace');
    expect(pricing).toContain('Existing bookings are not repriced');
    expect(pricing).toContain('addPricingRule({ apartmentId: apt.id');
    expect(pricing).toContain('onClick={() => applyPreset(preset)}');
  });

  it('names all switch purposes and preserves a 44px hit area with compact visual tracks', () => {
    const direct = component('booking-page-workspace');
    expect(direct).toContain('switchLabel="Enable direct booking page preference"');
    expect(direct).toContain('checked={config.enabled}');
    const helper = component('reference-ui');
    expect(helper).toContain("role={switchLabel ? 'switch' : undefined}");
    expect(helper).toContain('aria-checked={switchLabel ? checked : undefined}');
    const primitives = read('src/components/ui/primitives.module.css');
    expect(primitives).toContain('min-height: var(--control-height)');
    expect(read('src/app/globals.css')).toContain('--control-height: 44px');
    const plan = component('plan-workspace');
    expect(plan).toContain('aria-label="Annual billing"');
    expect(plan).toContain('className={styles.switch}');
    expect(plan).toContain('aria-checked=');
    const whatsapp = component('whatsapp-workspace');
    expect(whatsapp).toContain("aria-label={template.label + ' automation'}");
    expect(whatsapp).toContain("aria-label={template.label + ' template'}");
    expect(whatsapp).toContain('className={styles.switch}');
    const specialistCss = read('src/components/shortlet/shortlet-specialists-polish.module.css');
    expect(specialistCss).toMatch(/\.switch\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
    expect(whatsapp).toContain('durable retry queue');
    expect(whatsapp).toContain('signed delivery callbacks');
  });

  it('uses shared table/KPI contracts and preserves record-based channel conflict signals', () => {
    expect(component('team-workspace')).toContain("className={'pb-data-table ' + styles.table}");
    expect(component('team-workspace')).toContain('aria-label="Shortlet role permission reference table"');
    expect(component('booking-page-workspace')).toContain("className={'pb-data-table ' + styles.table}");
    expect(component('booking-page-workspace')).toContain('aria-label="Illustrative apartment booking funnel table"');
    expect(read('src/app/(ops)/shortlet/guests/page.tsx')).toContain('<ShortletMetric');
    expect(component('reference-ui')).toContain('<KpiCard');
    const channels = component('channels-workspace');
    expect(channels).toContain('pressed={configured}');
    expect(component('reference-ui')).toContain('aria-pressed={pressed}');
    expect(channels).toContain('Double-booking guard');
    expect(channels).toContain('residual double-booking window');
    expect(channels).toContain('<ShortletMetric label="Active feeds"');
    expect(channels).toContain('syncChannelConnection');
  });
});
