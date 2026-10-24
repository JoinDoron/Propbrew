import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AssetsExplorer } from '@/components/assets/assets-explorer';
import { SpacesExplorer } from '@/components/spaces/spaces-explorer';
import { VendorsExplorer } from '@/components/vendors/vendors-explorer';
import { WorkOrdersBoard, type WoRow } from '@/components/work-orders/work-orders-board';
import { WorkOrdersIntel } from '@/components/work-orders/work-orders-intel';
import { WorkOrderDetailView } from '@/components/work-orders/work-order-detail-view';
import { TransitionActions } from '@/components/work-orders/transition-actions';
import { Timeline } from '@/components/work-orders/timeline';
import { workOrders } from '@/server/data/seed/fixtures';
import type { Actor } from '@/lib/authz';
import type { WorkOrder } from '@/domain/entities';
import type { HistoryEntry } from '@/server/data/store';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/work-orders', () => ({ fireWoTransition: vi.fn() }));
vi.mock('@/server/data', () => ({ seed: { users: [], vendors: [] } }));
vi.mock('@/server/data/store', async (original) => ({ ...await original<typeof import('@/server/data/store')>(), getHistory: () => [] }));

const render = <Props extends object>(component: ComponentType<Props>, props: Props) => renderToStaticMarkup(createElement(component, props));
const source = (file: string) => readFileSync(resolve(process.cwd(), `src/components/${file}.tsx`), 'utf8');
const css = () => readFileSync(resolve(process.cwd(), 'src/components/facility/facility-registers-polish.module.css'), 'utf8');
const nowMs = Date.parse('2026-07-26T09:00:00Z');
const workOrder: WorkOrder = { ...workOrders[0], ref: 'WO-POLISH', status: 'new', assigneeName: 'Unassigned', cost: { minor: 12345, currency: 'USD' } };
const row: WoRow = { ...workOrder, breached: false };
const actor: Actor = { userId: 'manager', tenantId: workOrder.tenantId, roles: ['estate_manager'], estateIds: [workOrder.estateId], allEstates: false, unitIds: [], vendorOrgId: null, investorProjectIds: [] };
const assets = [{ id: 'asset-1', name: 'Lekki backup generator', category: 'Power', serial: 'GEN-234-001', locationLabel: 'Block A plant room', status: 'degraded', purchaseDate: '2020-03-01', warrantyExpiry: '2026-06-30' }];
const vendors = [{ id: 'vendor-1', name: 'Lagos Power Services', services: ['Electrical'], coverage: 'Lagos and Ogun', compliance: 'valid', insuranceExpiry: '2027-01-01', jobsCompleted: 12, slaHitRate: 90, rating: 4.5 }];

describe('Deep Facility register Clinexa polish', () => {
  it('keeps both asset panels mounted and preserves selected facts, health, plans and service history', () => {
    const html = render(AssetsExplorer, { assets, ppm: [{ id: 'plan-1', assetId: 'asset-1', frequency: 'monthly', nextDue: '2026-08-01', overdue: false, checklistItems: 4, assignee: 'Emeka' }], jobs: [{ id: 'job-1', ref: 'WO-POLISH', title: 'Inspect generator starter', status: 'assigned', assetId: 'asset-1', costLabel: '$123.45' }], health: { 'asset-1': { score: 30, band: 'elevated', topDriver: 'Missed service', confidence: .5 } }, canMutate: false });
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    for (const value of ['GEN-234-001', '2020-03-01', '2026-06-30', 'Missed service', '4 checks', 'Emeka', 'Inspect generator starter', '$123.45']) expect(html).toContain(value);
    expect(html).toContain('aria-controls=');
    expect(html).toContain('aria-label="Lekki backup generator asset details"');
    expect(html).toContain('Rules-based asset health index 70 out of 100');
    expect(html).toContain('No verified file attached'.toLowerCase());
    expect(html).toContain('Read-only');
    expect(html).not.toContain('Add asset');
  });

  it('retains the asset reference label without pretending it is a scannable QR code', () => {
    const view = source('assets/assets-explorer');
    expect(view).toContain('FacilityDialog title="Asset identification label"');
    expect(view).toContain('A scannable QR code and on-site asset lookup are not connected');
    expect(view).not.toContain('hashGrid');
    expect(view).toContain('facilityMoney(totalExposure * 100)');
    expect(view).toContain('trade and risk-band assumptions'.replace('trade', 'Trade'));
  });

  it('keeps readable space hierarchy controls, mounted building regions and all occupancy views', () => {
    const html = render(SpacesExplorer, { sites: [{ id: 'site-1', name: 'Lekki Gardens', address: 'Lekki, Lagos', kind: 'estate', buildingCount: 1, unitCount: 1 }], buildings: [{ id: 'building-1', siteId: 'site-1', name: 'Block A', floors: 3 }], units: [{ id: 'unit-1', siteId: 'site-1', buildingId: 'building-1', label: 'A-101', type: '2-bed apartment', occupancy: 'occupied', residentName: 'Ada Okafor' }] });
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    for (const value of ['Site and building navigation', 'Lekki Gardens', 'Block A', '3 floors', 'A-101', 'Ada Okafor', 'aria-label="Search units"']) expect(html).toContain(value);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('₦450,000.00');
    expect(html).toContain('not rent collected');
    expect(html).toContain('not measured historical occupancy');
    expect(html).toContain('assumed rent');
    expect(html).not.toContain('w-[22px]');
  });

  it('keeps vendor scores and recorded costs while distinguishing unverified document claims', () => {
    const html = render(VendorsExplorer, { vendors, jobs: [{ id: 'job-1', ref: 'WO-POLISH', title: 'Replace switchgear', status: 'assigned', vendorOrgId: 'vendor-1' }], spend: { 'vendor-1': 12345 }, spendLabels: { 'vendor-1': '$123.45' }, canMutate: false });
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    for (const value of ['Lagos Power Services', 'Lagos and Ogun', '$123.45', '12', '90%', '4.5', 'Replace switchgear']) expect(html).toContain(value);
    expect(html).toContain('aria-label="Sort vendor directory"');
    expect(html).toContain('aria-label="Lagos Power Services vendor details"');
    expect(html).toContain('File not verified');
    expect(html).toContain('Cover not verified');
    expect(html).toContain('not measured historical delivery');
    expect(html).not.toContain('>Onboard<');
  });

  it('shows each unit status visibly without depending on occupancy-map colours', () => {
    const html = render(SpacesExplorer, { sites: [{ id: 'site-1', name: 'Lekki Gardens', address: 'Lekki, Lagos', kind: 'estate', buildingCount: 1, unitCount: 3 }], buildings: [{ id: 'building-1', siteId: 'site-1', name: 'Block A', floors: 3 }], units: ['occupied', 'reserved', 'vacant'].map((occupancy, index) => ({ id: `unit-${index}`, siteId: 'site-1', buildingId: 'building-1', label: `A-${index + 1}`, type: '2-bed apartment', occupancy })) });
    const tiles = html.match(/<li\b[^>]*aria-label="A-[^"]+"[^>]*>[\s\S]*?<\/li>/g) ?? [];
    expect(tiles).toHaveLength(3);
    ['occupied', 'reserved', 'vacant'].forEach((status, index) => {
      expect(tiles[index]).toContain(`>A-${index + 1}</span>`);
      expect(tiles[index]).toContain(`>${status}</span>`);
      expect(tiles[index]).toContain('assumed rent ₦450,000.00 per month');
    });
    expect(css()).toContain('.unitMapStatus { font-size:12px; text-transform:capitalize;');
    expect(css()).toContain('.unitMap { display:flex; flex-wrap:wrap;');
  });

  it('describes the Facility work-order page as a snapshot with rules-based advisory triage', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/(ops)/(facility)/work-orders/page.tsx'), 'utf8');
    expect(page).toContain('subtitle="SLA snapshot and rules-based advisory triage — every job from request to close"');
    expect(page).not.toContain('Live SLA countdowns');
    expect(page).toContain('nowMs={NOW_MS}');
  });

  it('selects matched vendors without leaving them hidden by the old search filter', () => {
    const view = source('vendors/vendors-explorer');
    expect(view).toContain("setSelectedId(r.vendor.id); setFilter('all'); setQ(''); setSection('directory');");
    expect(view).toContain('Rules-based vendor matching');
    expect(view).toContain('no automatic assignment');
    expect(view).toContain('role="img"');
  });

  it('keeps every work-order column in a named local scroll region on mobile', () => {
    const html = render(WorkOrdersBoard, { rows: [row], canMutate: false });
    expect(html.match(/scope="col"/g)).toHaveLength(7);
    expect(html).toContain('scope="row"');
    expect(html).toContain('aria-label="Work order register, horizontally scrollable"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Unassigned');
    expect(html).toContain('$123.45');
    expect(source('work-orders/work-orders-board')).not.toMatch(/max-\[[^\]]+\]:hidden/);
    expect(source('work-orders/work-orders-board')).toContain('className={polish.boardCard}');
    expect(css()).toContain('min-width:840px');
  });

  it.each(['/work-orders', '/estate/work-orders'])('preserves all record links in the %s module context', (basePath) => {
    const board = render(WorkOrdersBoard, { rows: [row], canMutate: false, basePath });
    const intelligence = render(WorkOrdersIntel, { wos: [workOrder], nowMs, canMutate: true, basePath });
    expect(board.match(new RegExp(`href="${basePath}/WO-POLISH"`, 'g'))).toHaveLength(2);
    expect(intelligence.match(new RegExp(`href="${basePath}/WO-POLISH"`, 'g'))).toHaveLength(3);
  });

  it('keeps the supplied Estate create action behind the existing mutation gate', () => {
    const createAction = createElement('button', { type: 'button' }, 'Create Estate work order');
    expect(render(WorkOrdersBoard, { rows: [row], canMutate: true, basePath: '/estate/work-orders', createAction })).toContain('Create Estate work order');
    expect(render(WorkOrdersBoard, { rows: [row], canMutate: false, createAction })).not.toContain('Create Estate work order');
    expect(render(WorkOrdersBoard, { rows: [], canMutate: true })).toContain('New · unavailable');
  });

  it('shows snapshot SLA and currency-separated recorded costs without claiming live intelligence or settlement', () => {
    const html = render(WorkOrdersIntel, { wos: [{ ...workOrder, cost: { minor: 10001, currency: 'NGN' } }, { ...workOrder, id: workOrders[1].id, ref: 'WO-USD', cost: { minor: 20002, currency: 'USD' } }], nowMs, canMutate: false });
    expect(html).toContain('₦100.01');
    expect(html).not.toContain('₦300.03');
    expect(html).toContain('SLA watch');
    expect(html).toContain('snapshot only');
    expect(html).toContain('not a calibrated model recommendation');
    expect(html).toContain('not verified invoices');
    expect(source('work-orders/work-orders-intel')).not.toContain('>live<');
    expect(source('work-orders/work-orders-intel')).toContain('Restore dismissed suggestions');
  });

  it('keeps work-order detail permissions, tab IDs and Estate back-navigation unchanged', () => {
    const html = render(WorkOrderDetailView, { actor, wo: workOrder, basePath: '/estate/work-orders' });
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html).toContain('href="/estate/work-orders"');
    expect(html).toContain('$123.45');
    expect(html).toContain('WAT');
    expect(html).toContain('id="');
    expect(source('work-orders/work-order-detail-view')).toContain("can(actor, 'work_orders', 'transition').allowed");
    expect(source('work-orders/work-order-detail-view')).toContain("id: 'actions'");
    expect(source('work-orders/work-order-detail-view')).toContain("id: 'history'");
    expect(source('work-orders/work-order-detail-view')).toContain('facilityAssignees(wo.tenantId, wo.siteId)');
    expect(source('work-orders/work-order-detail-view')).toMatch(/<h2[^>]+>\{wo\.title\}<\/h2>/);
    expect(source('work-orders/work-order-detail-view')).not.toContain('<h1');
  });

  it('keeps assignment and terminal transitions in protected native review forms with local errors', () => {
    const view = source('work-orders/transition-actions');
    expect(view).toContain('FacilityDialog title={`${assignFor.label} work order`}');
    expect(view).toContain('FacilityDialog title={`${review.label} work order`}');
    expect(view).toContain('pending={pending}');
    expect(view).toContain('<fieldset disabled={pending}');
    expect(view).toContain('if (inFlight.current || !events.some');
    expect(view).toContain('finally { inFlight.current = false; }');
    expect(view).toContain('required aria-label="Assignee"');
    expect(view).toContain('role="alert"');
    expect(view).toContain('terminal state');
    expect(render(TransitionActions, { woRef: 'WO-POLISH', events: [], assignees: [] })).toContain('No actions available');
  });

  it('shows actor-attributed chronological records with semantic WAT timestamps and safe readable notes', () => {
    const entry: HistoryEntry = { seq: 1, at: '2026-07-26T09:00:00Z', event: 'START', from: 'assigned', to: 'in_progress', actorId: 'technician-1', actorName: 'Emeka', actorRole: 'technician', note: '<script>unsafe</script>' };
    const html = render(Timeline, { machineKey: 'work-order', entries: [entry] });
    expect(html).toContain('Work started');
    expect(html).toContain('Emeka');
    expect(html).toContain('Technician');
    expect(html).toContain('<time dateTime="2026-07-26T09:00:00Z">');
    expect(html).toContain('WAT');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(render(Timeline, { machineKey: 'work-order', entries: [] })).toContain('No history yet');
  });

  it('defines readable responsive inner patterns rather than relying on page-shell overrides', () => {
    expect(css()).toContain('grid-template-columns:repeat(auto-fit,minmax(140px,1fr))');
    expect(css()).toContain('font-size:16px');
    expect(css()).toContain('font-size:14px');
    expect(css()).toContain('font-size:12px');
    expect(css()).toContain('gap:24px');
    expect(css()).toContain('@media(max-width:640px)');
    expect(css()).toContain('min-height:44px');
    expect(css()).toContain('.progress::-webkit-progress-value');
    expect(css()).toContain('.progress::-moz-progress-bar');
    expect(source('assets/assets-explorer')).toContain('className={polish.progress}');
    for (const file of ['assets/assets-explorer', 'spaces/spaces-explorer', 'vendors/vendors-explorer', 'work-orders/work-orders-board', 'work-orders/work-orders-intel', 'work-orders/work-order-detail-view', 'work-orders/timeline']) expect(source(file)).toContain('facility-registers-polish.module.css');
  });
});
