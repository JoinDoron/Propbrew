import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AssetsExplorer } from '@/components/assets/assets-explorer';
import { SpacesExplorer } from '@/components/spaces/spaces-explorer';
import { VendorsExplorer } from '@/components/vendors/vendors-explorer';
import { DocumentsWorkspace } from '@/components/documents/documents-workspace';
import { WorkOrdersBoard } from '@/components/work-orders/work-orders-board';
import { WorkOrdersIntel } from '@/components/work-orders/work-orders-intel';
import { InspectionsList } from '@/components/inspections/inspections-list';
import { BookingsWorkspace } from '@/components/bookings/bookings-workspace';
import { MarketplaceWorkspace } from '@/components/marketplace/marketplace-workspace';
import { asId, type SiteId, type TenantId } from '@/domain/ids';
import type { Inspection } from '@/domain/entities';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/transitions', () => ({ transition: vi.fn() }));
vi.mock('@/server/actions/documents', () => ({ uploadDocument: vi.fn(), saveDocumentFields: vi.fn(), searchDocuments: vi.fn() }));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const inspection: Inspection = {
  id: 'inspection-1', tenantId: asId<TenantId>('tenant-1'), estateId: asId<SiteId>('estate-1'), siteId: asId<SiteId>('estate-1'),
  ref: 'INSP-001', template: 'Generator safety check', obligationId: 'obligation-1', criticality: 'statutory',
  assetName: 'Main generator', status: 'passed', scheduledDate: '2026-07-26', checklist: [], passItems: 4,
  failItems: 0, inspector: 'Ngozi', raisedWorkOrders: 0, raisedWorkOrderRefs: [],
};

describe('Clinexa-adapted operational registers', () => {
  it('uses explicit design opt-ins for the operational filters without changing rounded status indicators', () => {
    for (const path of [
      'assets/assets-explorer.tsx', 'spaces/spaces-explorer.tsx', 'vendors/vendors-explorer.tsx',
      'documents/documents-workspace.tsx', 'inspections/inspections-list.tsx', 'work-orders/work-orders-board.tsx',
    ]) {
      const view = source(`src/components/${path}`);
      expect(view).toMatch(/pb-register-toolbar|layout.toolbar|styles.filters/);
      expect(view).toMatch(/pb-filter|<Button\b/);
      expect(view).toContain('aria-pressed=');
      expect(view).not.toMatch(/h-8[^\n`"]*rounded-full/);
    }
    expect(source('src/components/spaces/spaces-explorer.tsx')).toContain('Unit occupancy map');
    expect(source('src/components/spaces/spaces-explorer.tsx')).toContain('role="img"');
  });

  it('uses full-size, labelled rectangular search fields on every explorer', () => {
    for (const [area, label] of [['assets', 'assets'], ['spaces', 'units'], ['vendors', 'vendors']] as const) {
      const view = source(`src/components/${area}/${area}-explorer.tsx`);
      expect(view).toMatch(/className="pb-search"|className=\{layout.search\}/);
      expect(view).toContain(`aria-label="Search ${label}"`);
      expect(view).toContain('size={16}');
    }
  });

  it('preserves asset health values and all register sections in the new KPI strips', () => {
    const html = renderToStaticMarkup(createElement(AssetsExplorer, { assets: [], ppm: [], jobs: [], health: {}, canMutate: false }));
    expect(html.match(/class="[^"]*kpiValue_[^\"]*"/g)).toHaveLength(4);
    expect(html.match(/class="[^"]*kpiHeader_[^\"]*"/g)).toHaveLength(4);
    expect(html).toContain('Downtime exposure');
    expect(html).toContain('No assets match');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Read-only');
    expect(html).not.toContain('Add asset');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  });

  it('preserves vendor data and advisory matching while making selection controls explicit', () => {
    const html = renderToStaticMarkup(createElement(VendorsExplorer, {
      vendors: [{ id: 'vendor-1', name: 'Lagos Power Services', services: ['Electrical'], coverage: 'Lagos', compliance: 'valid', insuranceExpiry: '2027-01-01', jobsCompleted: 2, slaHitRate: 90, rating: 4.5 }],
      jobs: [], spend: {}, canMutate: false,
    }));
    expect(html).toContain('Lagos Power Services');
    expect(html).toContain('Rules-based ranking from recorded metrics · no automatic assignment');
    expect(html).toContain('aria-label="Search vendors"');
    expect(html).toContain('aria-label="Sort vendor directory"');
    expect(html).not.toContain('>Onboard<');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  });

  it('preserves space hierarchy, local unit search and indicative revenue disclosure', () => {
    const html = renderToStaticMarkup(createElement(SpacesExplorer, {
      sites: [{ id: 'site-1', name: 'Lekki Gardens', address: 'Lagos', kind: 'estate', buildingCount: 1, unitCount: 1 }],
      buildings: [{ id: 'building-1', siteId: 'site-1', name: 'Block A', floors: 1 }],
      units: [{ id: 'unit-1', siteId: 'site-1', buildingId: 'building-1', label: 'A-101', type: 'Apartment', occupancy: 'vacant' }],
    }));
    expect(html).toContain('Lekki Gardens');
    expect(html).toContain('Block A');
    expect(html).toContain('A-101');
    expect(html).toContain('aria-label="Search units"');
    expect(html).toContain('Uses indicative rent assumptions, not recorded leases, invoices or bank payments.');
  });

  it('keeps document library, AI search, compliance and audience controls with fluid content width', () => {
    const html = renderToStaticMarkup(createElement(DocumentsWorkspace, { now: '2026-07-26', documents: [], canMutate: false, scopeLabel: 'Lekki Gardens' }));
    expect(html).toContain('class="pb-page"');
    expect(html).toContain('data-page-header="true"');
    expect(html).not.toContain('<h1');
    expect(html).toContain('0 document records · 0 marked indexed · Lekki Gardens');
    expect(html).toContain('View as resident');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('No documents here.');
    expect(html).not.toContain('max-w-[1100px]');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
  });

  it('keeps work order record links and read-only gates in the spacious table', () => {
    const html = renderToStaticMarkup(createElement(WorkOrdersBoard, {
      rows: [{ id: 'work-1', ref: 'WO-001', title: 'Restore borehole pump', origin: 'resident', requesterName: 'Ada', status: 'new', priority: 'high', assigneeName: 'Unassigned', respondDueAt: null, breached: false, cost: null }],
      canMutate: false,
    }));
    expect(html).toMatch(/class="pb-data-table(?: [^"]*)?"/);
    expect(html).toContain('pb-table-frame');
    expect(html).toContain('href="/work-orders/WO-001"');
    expect(html).toContain('Restore borehole pump');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Read-only');
    expect(html).not.toContain('>New</button>');
  });

  it('provides a keyboard-accessible inspection View action with the same drawer handler', () => {
    const html = renderToStaticMarkup(createElement(InspectionsList, { data: { now: '2026-07-26', obligations: [], inspections: [inspection], canMutate: false }, onRun: vi.fn() }));
    expect(html).toContain('aria-label="Inspection register"');
    expect(html.match(/scope="col"/g)).toHaveLength(7);
    expect(source('src/components/inspections/inspections-list.tsx')).toContain('className={styles.table}');
    expect(html).toContain('aria-label="View inspection INSP-001"');
    expect(html).toContain('Generator safety check');
    expect(html).not.toContain('aria-label="Run inspection');
    expect(source('src/components/inspections/inspections-list.tsx')).toContain('e.stopPropagation(); onRun(i.id);');
  });

  it('retains the mutation gate for scheduled inspection actions', () => {
    const html = renderToStaticMarkup(createElement(InspectionsList, { data: { now: '2026-07-26', obligations: [], inspections: [{ ...inspection, status: 'scheduled' }], canMutate: true }, onRun: vi.fn() }));
    expect(html).toContain('aria-label="Run inspection INSP-001"');
    expect(html).toMatch(/<button[^>]*aria-label="Run inspection INSP-001"/);
  });

  it('uses shared KPI cards for bookings and commerce while retaining work order intelligence strips', () => {
    const views = [
      renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [], canMutate: false })),
      renderToStaticMarkup(createElement(MarketplaceWorkspace, { orders: [], listings: [], vendors: [], flags: [], canMutate: false, gmv: { grossMinor: 0, realizedMinor: 0, pendingMinor: 0, voidMinor: 0, orders: 0, realizedRate: 0 } })),
      renderToStaticMarkup(createElement(WorkOrdersIntel, { wos: [], nowMs: Date.parse('2026-07-26'), canMutate: false })),
    ];
    for (const [index, html] of views.entries()) {
      if (index < 2) {
        expect(html.match(/class="[^"]*kpiValue[^\"]*"/g)).toHaveLength(4);
      } else {
        expect(html.match(/class="[^"]*kpiValue_[^\"]*"/g)).toHaveLength(4);
        expect(html.match(/class="[^"]*kpiHeader_[^\"]*"/g)).toHaveLength(4);
        expect(html).toContain('SLA attention');
      }
      expect(html).toContain('₦');
    }
    expect(views[0]).toContain('No bookings yet');
    expect(source('src/components/bookings/bookings-workspace.tsx')).toContain('pb-data-table');
    expect(views[1]).toContain('Closed does not mean the vendor has been paid.');
    expect(views[2]).toContain('AI-F-02 · advisory, you decide');
  });
});
