import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UsersWorkspace, type UserRow } from '@/components/admin/users-workspace';
import { AuditWorkspace, auditCsvCell } from '@/components/admin/audit-workspace';
import { AiWorkspace } from '@/components/admin/ai-workspace';
import { PlatformOverview } from '@/components/admin/platform-overview';
import { TenantsWorkspace } from '@/components/admin/tenants-workspace';
import { BillsWorkspace, type BillRow } from '@/components/portal/bills-workspace';
import { SafetyWorkspace, normalizeContactPhone } from '@/components/portal/safety-workspace';
import { RequestsWorkspace } from '@/components/portal/requests-workspace';
import { MarketplaceWorkspace, reorderListing, type ListingCard, type OrderCard } from '@/components/portal/marketplace-workspace';
import { CommunityHub } from '@/components/portal/community-hub';
import { portalMoney } from '@/components/portal/portal-patterns';
import { WorkspaceDecisionDialog } from '@/components/ui/workspace-decision';
import { InvestorProjectsView } from '@/components/domain/investor-projects';
import type { InvestorProject } from '@/domain/entities';
import { asId, type TenantId } from '@/domain/ids';
import { money } from '@/domain/primitives';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/admin-users', () => ({ setUserStatus: vi.fn() }));
vi.mock('@/server/actions/resident-home', () => ({ payChargeFromWallet: vi.fn() }));
vi.mock('@/server/actions/resident-bills', () => ({ payAllOutstanding: vi.fn() }));
vi.mock('@/server/actions/resident-requests', () => ({ raiseRequest: vi.fn() }));
vi.mock('@/server/actions/resident-orders', () => ({ placeOrder: vi.fn() }));
vi.mock('@/server/actions/transitions', () => ({ raiseSos: vi.fn() }));
vi.mock('@/server/actions/resident-community', () => ({}));

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const render = (element: ReactElement) => renderToStaticMarkup(element);
const user: UserRow = { id: 'user-1', name: 'Ada Obi', email: 'ada@example.test', tenantLabel: 'Lagos', roles: [{ key: 'resident', label: 'Resident' }], status: 'active', lastActive: 'Not recorded' };
const bill: BillRow = { id: 'bill-1', ref: 'INV-1', description: 'Service charge', status: 'issued', amountMinor: 100_025, paidMinor: 25, dueDate: '2026-10-23', agingDays: 0, currency: 'NGN', paidCurrency: 'NGN' };

describe('complete composed Admin and own-record portal design', () => {
  it.each([
    ['users', createElement(UsersWorkspace, { users: [user] }), 2],
    ['audit', createElement(AuditWorkspace, { entries: [] }), 1],
    ['AI', createElement(AiWorkspace, { features: [{ id: 'AI-1', title: 'Triage', benchmark: 'Review recall', priority: 'Must', calls: 10 }] }), 2],
    ['organisations', createElement(TenantsWorkspace, { tenants: [] }), 2],
    ['bills', createElement(BillsWorkspace, { bills: [bill], walletMinor: 150_000 }), 3],
    ['safety', createElement(SafetyWorkspace, { events: [] }), 3],
    ['requests', createElement(RequestsWorkspace, { requests: [] }), 3],
    ['marketplace', createElement(MarketplaceWorkspace, { listings: [], orders: [] }), 2],
    ['community', createElement(CommunityHub, { firstName: 'Ada', motions: [], events: [], rewards: null, perks: [], election: null, parcels: [], notices: [] }), 4],
  ] as const)('%s retains every mounted, named tab panel', (_name, tree, count) => {
    const html = render(tree);
    expect(html.match(/role="tab"/g)).toHaveLength(count);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(count);
    expect(html.match(/hidden=""/g)?.length ?? 0).toBe(count - 1);
    expect(html).not.toContain('linear-gradient');
  });

  it('does not grant account mutations by default or on render', () => {
    const html = render(createElement(UsersWorkspace, { users: [user] }));
    expect(html).toContain('Ada Obi'); expect(html).toContain('Read-only');
    expect(html).not.toContain('Review suspension for');
    expect(render(createElement(UsersWorkspace, { users: [user], canMutate: true }))).toContain('Review suspension for Ada Obi');
    expect(source('src/components/admin/users-workspace.tsx')).toContain('action: () => setUserStatus(user.id, next)');
  });

  it('provides labelled locally scrollable audit and user registers with column scopes', () => {
    const users = render(createElement(UsersWorkspace, { users: [user] }));
    expect(users).toContain('role="region"'); expect(users).toContain('tabindex="0"'); expect(users).toContain('scope="col"');
    const audit = render(createElement(AuditWorkspace, { entries: [{ machine: 'work-order', machineLabel: 'Work order', recordId: 'WO-1', event: 'complete', from: 'in_progress', to: 'completed', actorName: 'Ada', actorRole: 'Manager', at: '2026-10-23T09:00:00Z', security: false, financial: true }] }));
    expect(audit).toContain('aria-label="Platform audit register"'); expect(audit).toContain('10:00'); expect(audit).toContain('WO-1');
    expect(audit).toContain('not a complete durable PostgreSQL audit trail');
    expect(audit).toContain('CSV includes all matching session records');
  });

  it.each(['=SUM(A1)', '+123', '-cmd', '@SUM(A1)', '  =1+1'])('neutralises spreadsheet formula injection in %s', (input) => {
    expect(auditCsvCell(input)).toBe(`"'${input}"`);
  });
  it('escapes quotation marks without altering ordinary audit content', () => {
    expect(auditCsvCell('Ada "Obi", Manager')).toBe('"Ada ""Obi"", Manager"');
  });

  it('labels AI controls as session policy previews and benchmarks as targets', () => {
    const html = render(createElement(AiWorkspace, { features: [{ id: 'AI-1', title: 'Triage', benchmark: 'Review recall', priority: 'Must', calls: 10 }] }));
    expect(html).toContain('Session-only preview'); expect(html).toContain('Evaluation target');
    expect(html).toContain('not provider invoices'); expect(html).toContain('not evidence of a completed evaluation');
    expect(html).toContain('aria-pressed="true"'); expect(html).toContain('Triage: Shadow mode');
  });

  it('keeps platform estimates separate from service-health and bank verification', () => {
    const html = render(createElement(PlatformOverview, { totals: { tenants: 0, units: 0, users: 0, mrrMinor: 12345, incidents: 0, aiCostMinor: 0 }, tenants: [], events: [], ai: { calls: 0, capPct: 0 }, systems: [{ name: 'Database', status: 'not_configured' }] }));
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3); expect(html).toContain('₦123.45');
    expect(html).toContain('not a live service-health monitor'); expect(html).toContain('Not configured');
  });

  it('keeps native monetary minor units exact for NGN, GHS and KES', () => {
    expect(portalMoney(12345)).toBe('₦123.45');
    expect(portalMoney(12345, 'GHS')).toContain('123.45'); expect(portalMoney(12345, 'KES')).toContain('123.45');
  });
  it('never adds a dollar invoice into naira outstanding totals or offers mixed-currency Pay all', () => {
    const html = render(createElement(BillsWorkspace, { bills: [bill, { ...bill, id: 'usd', ref: 'USD-1', currency: 'USD', paidCurrency: 'USD', amountMinor: 700_000 }], walletMinor: 150_000, canPay: true }));
    expect(html).toContain('₦1,000'); expect(html).not.toContain('₦8,000');
    expect(html).not.toContain('Review pay all'); expect(html).toContain('No FX conversion');
  });
  it('does not offer Pay all on incomplete reads or unsupported wallet currency', () => {
    for (const props of [{ completeRead: false }, { walletCurrency: 'USD' }]) {
      const html = render(createElement(BillsWorkspace, { bills: [bill], walletMinor: 150_000, canPay: true, ...props }));
      expect(html).not.toContain('Review pay all');
    }
  });
  it('offers reviewed payment only with the exact create grant and complete NGN records', () => {
    const denied = render(createElement(BillsWorkspace, { bills: [bill], walletMinor: 150_000 }));
    const allowed = render(createElement(BillsWorkspace, { bills: [bill], walletMinor: 150_000, canPay: true }));
    expect(denied).toContain('Read-only billing access'); expect(denied).not.toContain('Review pay all');
    expect(allowed).toContain('Review pay all'); expect(allowed).toContain('Review payment for INV-1');
    expect(allowed).toContain('not a bank statement');
  });
  it('excludes mismatched paid-currency data from derived totals', () => {
    const html = render(createElement(BillsWorkspace, { bills: [{ ...bill, paidCurrency: 'USD' }], walletMinor: 0, canPay: true }));
    expect(html).not.toContain('Review pay all'); expect(html).not.toContain('Review payment for INV-1');
    expect(html).toContain('Currency records need review'); expect(html).toContain('INV-1');
    expect(html).toContain('their absence from a total does not mean they are settled');
  });

  it('only reorders an unambiguous vendor/title/currency match', () => {
    const order: OrderCard = { id: 'o1', ref: 'ORD-1', listingTitle: 'Cleaning', vendorOrgId: 'vendor-1', status: 'declined', amountMinor: 12345, currency: 'NGN' };
    const listing: ListingCard = { id: 'l1', title: 'Cleaning', vendorOrgId: 'vendor-1', vendorName: 'Lagos service', category: 'Cleaning', priceMinor: 12345, currency: 'NGN' };
    expect(reorderListing(order, [listing])).toEqual(listing);
    expect(reorderListing(order, [listing, { ...listing, id: 'l2' }])).toBeUndefined();
    expect(reorderListing(order, [{ ...listing, currency: 'USD' }])).toBeUndefined();
    expect(reorderListing(order, [{ ...listing, vendorOrgId: 'vendor-2' }])).toBeUndefined();
    expect(reorderListing({ ...order, vendorOrgId: undefined }, [listing])).toBeUndefined();
  });
  it.each(['()--', '++23412345678', 'abc123', '12', '1234567890123456'])('rejects unusable contact number %s', (phone) => {
    expect(normalizeContactPhone(phone)).toBeNull();
  });
  it('normalises a valid Nigerian number without silently inventing a dialling prefix', () => {
    expect(normalizeContactPhone('+234 (803) 123-4567')).toBe('+2348031234567');
    expect(normalizeContactPhone('0803 123 4567')).toBe('08031234567');
  });
  it('names the actual primary SOS record target, not the currently selected unit', () => {
    expect(source('src/app/(portal)/portal/security/page.tsx')).toContain('const targetUnitId = actor.unitIds[0]');
    expect(source('src/components/portal/safety-workspace.tsx')).toContain('Record target: {targetUnitLabel}');
    expect(source('src/components/portal/safety-workspace.tsx')).toContain('not the currently selected unit');
  });
  it('does not misrepresent demo account-status edits as identity-provider enforcement', () => {
    const code = source('src/components/admin/users-workspace.tsx');
    expect(code).toContain('does not revoke or restore Clerk sessions');
    expect(code).toContain('Identity-provider access has not been changed');
  });
  it('lets coarse-pointer rating controls wrap and names the record being rated', () => {
    const code = source('src/components/portal/requests-workspace.tsx');
    expect(code).toContain('border-t border-border flex flex-wrap items-center');
    expect(code).toContain('aria-label={`Rate maintenance request ${r.ref}`}');
  });

  it('keeps safety visible outside tabs without automatic countdown writes or invented phone contacts', () => {
    const html = render(createElement(SafetyWorkspace, { events: [], canRaise: true }));
    expect(html.indexOf('Review SOS alert')).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).toContain('No verified estate contacts configured');
    const code = source('src/components/portal/safety-workspace.tsx');
    expect(code).not.toContain('setInterval'); expect(code).not.toContain('setTimeout');
    expect(code).toContain('No action occurs until you confirm'); expect(code).toContain('canClose={!pending} dismissOnBackdrop={false}');
  });
  it('does not expose request creation by default', () => {
    const html = render(createElement(RequestsWorkspace, { requests: [] }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Raise a request/);
    expect(source('src/app/(portal)/portal/requests/page.tsx')).toContain("can(actor, 'work_orders', 'create').allowed");
  });
  it('preserves readable maintenance and order trackers in named local overflow areas', () => {
    for (const [file, label] of [['requests', 'Maintenance request progress'], ['marketplace', 'Order progress']] as const) {
      const code = source(`src/components/portal/${file}-workspace.tsx`);
      expect(code).toContain(`aria-label="${label}"`); expect(code).toContain('tabIndex={0}');
      expect(code).toContain("aria-current={current ? 'step' : undefined}"); expect(code).not.toContain('text-[9px]');
      expect(code).toContain('inFlight.current'); expect(code).toContain('canClose={!pending}');
      expect(code).toContain("background: done ? toneVar('success')");
      expect(code).not.toContain('bg-success');
    }
  });
  it('opens review dialogs without executing financial, access or participation actions', () => {
    const action = vi.fn();
    const html = render(createElement(WorkspaceDecisionDialog, { decision: { title: 'Review record', record: 'REC-1', description: 'Check details', confirmLabel: 'Confirm change', action }, onClose: vi.fn() }));
    expect(action).not.toHaveBeenCalled(); expect(html).toContain('aria-modal="true"'); expect(html).toContain('REC-1');
    const code = source('src/components/ui/workspace-decision.tsx');
    expect(code).toContain('if (inFlight.current) return'); expect(code).toContain('role="alert"');
    expect(code).toContain('finally { inFlight.current = false; }'); expect(code).toContain('canClose={!pending}');
  });
  it('keeps mixed-currency investor sales separate without a fabricated growth delta', () => {
    const project: InvestorProject = { id: 'p1', projectId: 'p1', tenantId: asId<TenantId>('t1'), name: 'Lagos', location: 'Lagos', status: 'selling', unitsTotal: 10, unitsSold: 1, salesTarget: money(10000), salesToDate: money(12345), occupancyPct: 10, projectedRoiPct: 15, handoverDate: '2027-01-01' };
    const html = render(createElement(InvestorProjectsView, { projects: [project, { ...project, id: 'p2', salesToDate: money(20000, 'USD') }] }));
    expect(html).toContain('Recorded sales by currency'); expect(html).toContain('₦123.45');
    expect(html).toContain('$200'); expect(html).not.toContain('₦323.45');
    expect(html).toContain('not a calibrated AI valuation'); expect(html).not.toContain('↑');
  });
  it('uses responsive card grids, 12px metadata and protected selected-button styling', () => {
    const layout = source('src/components/ui/workspace-layout.module.css');
    expect(layout).toContain('repeat(4, minmax(0, 1fr))'); expect(layout).toContain('@media (max-width: 420px)');
    expect(layout).toContain('font-size: 12px'); expect(source('src/components/ui/primitives.module.css')).toContain(".button[aria-pressed='true']");
  });
});
