import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankCompanyWorkspaceState } from '@/server/data/store';
import { runWithRecordContext } from '@/server/data/record-context';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { ConstructionSnapshotProvider } from '@/components/construction/construction-ui';
import { operatingClock } from '@/server/operating-clock';
import { PricingWorkspace } from '@/components/shortlet/pricing-workspace';
const boundary = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('@/server/guard', () => ({ requireCapability: boundary.guard }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/offline/outbox', () => ({ useOutbox: () => [], useOnline: () => true, isForcedOffline: () => false, capture: vi.fn(), removeOp: vi.fn(), clearSynced: vi.fn(), abandon: vi.fn(), requeue: vi.fn(), setForcedOffline: vi.fn() }));
const tenant = '12345678-1234-4234-8234-123456789abc';
const actor = actorForCompanyMember({ membershipId: 'member-own', userId: 'owner-own', companyId: tenant, status: 'active', companyStatus: 'active', companyRole: 'owner', estateIds: [], allEstates: true }, 'owner-own')!;
const pages = [
  { route: 'shortlet/agents', load: () => import('@/app/(ops)/shortlet/agents/page') },
  { route: 'shortlet/analytics', load: () => import('@/app/(ops)/shortlet/analytics/page') },
  { route: 'shortlet/booking-page', load: () => import('@/app/(ops)/shortlet/booking-page/page') },
  { route: 'shortlet/bookings', load: () => import('@/app/(ops)/shortlet/bookings/page') },
  { route: 'shortlet/calendar', load: () => import('@/app/(ops)/shortlet/calendar/page') },
  { route: 'shortlet/channels', load: () => import('@/app/(ops)/shortlet/channels/page') },
  { route: 'shortlet/copilot', load: () => import('@/app/(ops)/shortlet/copilot/page') },
  { route: 'shortlet/expenses', load: () => import('@/app/(ops)/shortlet/expenses/page') },
  { route: 'shortlet/guests', load: () => import('@/app/(ops)/shortlet/guests/page') },
  { route: 'shortlet/inspections', load: () => import('@/app/(ops)/shortlet/inspections/page') },
  { route: 'shortlet/maintenance', load: () => import('@/app/(ops)/shortlet/maintenance/page') },
  { route: 'shortlet', load: () => import('@/app/(ops)/shortlet/page') },
  { route: 'shortlet/plan', load: () => import('@/app/(ops)/shortlet/plan/page') },
  { route: 'shortlet/pricing', load: () => import('@/app/(ops)/shortlet/pricing/page') },
  { route: 'shortlet/properties', load: () => import('@/app/(ops)/shortlet/properties/page') },
  { route: 'shortlet/reviews', load: () => import('@/app/(ops)/shortlet/reviews/page') },
  { route: 'shortlet/team', load: () => import('@/app/(ops)/shortlet/team/page') },
  { route: 'shortlet/whatsapp', load: () => import('@/app/(ops)/shortlet/whatsapp/page') },
  { route: 'construction/approvals', load: () => import('@/app/(ops)/construction/approvals/page') },
  { route: 'construction/audit', load: () => import('@/app/(ops)/construction/audit/page') },
  { route: 'construction/boq', load: () => import('@/app/(ops)/construction/boq/page') },
  { route: 'construction/build-watch', load: () => import('@/app/(ops)/construction/build-watch/page') },
  { route: 'construction/copilot', load: () => import('@/app/(ops)/construction/copilot/page') },
  { route: 'construction/digest', load: () => import('@/app/(ops)/construction/digest/page') },
  { route: 'construction/documents', load: () => import('@/app/(ops)/construction/documents/page') },
  { route: 'construction/evm', load: () => import('@/app/(ops)/construction/evm/page') },
  { route: 'construction/field', load: () => import('@/app/(ops)/construction/field/page') },
  { route: 'construction/fx', load: () => import('@/app/(ops)/construction/fx/page') },
  { route: 'construction/league', load: () => import('@/app/(ops)/construction/league/page') },
  { route: 'construction/materials', load: () => import('@/app/(ops)/construction/materials/page') },
  { route: 'construction', load: () => import('@/app/(ops)/construction/page') },
  { route: 'construction/procurement', load: () => import('@/app/(ops)/construction/procurement/page') },
  { route: 'construction/projects', load: () => import('@/app/(ops)/construction/projects/page') },
  { route: 'construction/risk', load: () => import('@/app/(ops)/construction/risk/page') },
  { route: 'construction/safety', load: () => import('@/app/(ops)/construction/safety/page') },
  { route: 'construction/schedule', load: () => import('@/app/(ops)/construction/schedule/page') },
  { route: 'construction/simulator', load: () => import('@/app/(ops)/construction/simulator/page') },
  { route: 'construction/site', load: () => import('@/app/(ops)/construction/site/page') },
  { route: 'construction/stock', load: () => import('@/app/(ops)/construction/stock/page') },
  { route: 'construction/timesheets', load: () => import('@/app/(ops)/construction/timesheets/page') },
  { route: 'construction/twin', load: () => import('@/app/(ops)/construction/twin/page') },
  { route: 'construction/workforce', load: () => import('@/app/(ops)/construction/workforce/page') },
] as const;
beforeEach(() => { vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T23:30:00Z')); boundary.guard.mockResolvedValue({ actor }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('native company module empty states', () => {
  it('illustrates the next 30 WAT nights for a native apartment instead of a frozen demo month', () => {
    const html = renderToStaticMarkup(createElement(PricingWorkspace, { currentDateISO: operatingClock().dateISO, apartments: [{ id: 'own-apartment', name: 'New company apartment', property: 'Own property', baseMinor: 1000000, rules: [{ id: 'own-rule', label: 'Recorded current rate', fromISO: '2026-10-25', toISO: '2026-11-23', type: 'fixed', amountMinor: 1200000 }] }] }));
    expect(html).toContain('25 Oct 2026'); expect(html).toContain('23 Nov 2026');
    expect(html).toContain('All 30 nights use ₦12,000.00 per night.');
    expect(html).not.toContain('1 Aug 2026');
  });
  it.each(pages)('renders /$route without sample records or a frozen company snapshot', async ({ route, load }) => {
    const state = blankCompanyWorkspaceState();
    const html = await runWithRecordContext({ state, domainTenantId: tenant, mode: 'read' }, async () => {
      const page = await load();
      const renderPage = page.default as unknown as (props?: { searchParams: Promise<{ projectId?: string }> }) => Promise<ReactElement>;
      const content = await renderPage(route === 'construction/schedule' ? { searchParams: Promise.resolve({}) } : undefined);
      return renderToStaticMarkup(createElement(ConstructionSnapshotProvider, { snapshot: operatingClock() }, content));
    });
    expect(html.length).toBeGreaterThan(100);
    expect(html).not.toMatch(/Marina Heights|Cedar Court|7 Fifteen Capital|Ngozi Okafor|26 July 2026/);
    expect(html).not.toContain('Invalid Date');
    expect(html).not.toContain('NaN');
    if (route === 'construction/schedule') {
      expect(html).toContain('Add a project and schedule to calculate a finish forecast.');
      expect(html).not.toContain('on plan');
    }
  });
});
