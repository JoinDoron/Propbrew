import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CommandCenter } from '@/components/construction/command-center';
import { ProjectsWorkspace } from '@/components/construction/projects-workspace';
import { ApprovalsWorkspace } from '@/components/construction/approvals-workspace';
import { FieldCapture } from '@/components/construction/field-capture';
import { PlatformOverview } from '@/components/admin/platform-overview';
import { DigestWorkspace } from '@/components/construction/digest-workspace';
import { EvmCockpit } from '@/components/construction/evm-cockpit';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/construction', () => ({
  acknowledgeSignal: vi.fn(), createProject: vi.fn(), decideApproval: vi.fn(),
  delegateApproval: vi.fn(), publishDigest: vi.fn(),
}));
vi.mock('@/lib/offline/outbox', () => ({
  useOutbox: () => [], useOnline: () => true, isForcedOffline: () => false,
  capture: vi.fn(), removeOp: vi.fn(), clearSynced: vi.fn(), abandon: vi.fn(),
  requeue: vi.fn(), setForcedOffline: vi.fn(),
}));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const tabCount = (html: string) => [...html.matchAll(/role="tab"/g)].length;

describe('Construction and platform page sections', () => {
  const constructionRoutes = [
    '', 'approvals', 'audit', 'boq', 'build-watch', 'copilot', 'digest', 'documents',
    'evm', 'field', 'fx', 'league', 'materials', 'operations', 'procurement', 'projects', 'risk',
    'safety', 'schedule', 'simulator', 'site', 'stock', 'timesheets', 'twin', 'workforce',
  ];

  it.each(constructionRoutes)('keeps /construction/%s guarded and connected to section tabs', (route) => {
    const page = source(`src/app/(ops)/construction/${route ? `${route}/` : ''}page.tsx`);
    expect(page).toMatch(/requireCapability\([^;]*'construction'\)/);
    const workspace = page.match(/from '@\/components\/construction\/([^']+)'/);
    expect(workspace).not.toBeNull();
    expect(source(`src/components/construction/${workspace![1]}.tsx`)).toContain('<PageTabs ');
  });

  it.each(['ai', 'audit', 'investors', 'overview', 'reports', 'requirements', 'tenants', 'users'])(
    'covers the platform /admin/%s page without changing its capability guard', (route) => {
      const page = source(`src/app/(admin)/admin/${route}/page.tsx`);
      expect(page).toContain('requireCapability(');
      const workspace = page.match(/from '@\/components\/admin\/([^']+)'/);
      const view = workspace ? source(`src/components/admin/${workspace[1]}.tsx`) : page;
      expect(view).toContain('<PageTabs ');
    },
  );

  it('does not leave a Construction workspace outside the shared tab pattern', () => {
    const files = readdirSync(resolve(process.cwd(), 'src/components/construction')).filter((file) => file.endsWith('.tsx') && !['construction-ui.tsx', 'drawing-controls.tsx', 'rfi-workspace.tsx'].includes(file));
    expect(files).toHaveLength(28);
    for (const file of files) {
      const workspace = source(`src/components/construction/${file}`);
      expect(workspace).toContain('<PageTabs ');
      expect(workspace).toContain('<ConstructionFrame>');
    }
    const helper = source('src/components/construction/construction-ui.tsx');
    expect(helper).toContain('<Card');
    expect(helper).toContain('<PortalDialog');
  });

  it('makes project setup and mobilisation a deep-linked rail hierarchy', () => {
    const shell = source('src/components/shell-frame.tsx');
    const setup = source('src/components/construction/project-setup-workspace.tsx');
    const route = source('src/app/(ops)/construction/projects/[projectId]/setup/page.tsx');
    for (const label of ['WBS & programme', 'Calendar & baselines', 'Packages & BOQ', 'Team & RACI', 'Locations', 'Parties & permits', 'Lifecycle controls']) {
      expect(source('src/config/construction-project-setup.ts')).toContain(label);
    }
    expect(shell).toContain('CONSTRUCTION_PROJECT_SETUP_SECTIONS.map');
    expect(shell).toContain("new URLSearchParams({ section: section.id })");
    expect(setup).toContain('activeTab={activeSection}');
    expect(setup).toContain("query.set('section', section)");
    expect(route).toContain('isConstructionProjectSetupSection');
    expect(route).toContain('initialSection={section}');
  });

  it('separates portfolio totals, operations, attention and exploration into distinct panels', () => {
    const html = renderToStaticMarkup(createElement(CommandCenter, {
      confidence: { score: 100, band: 'success', label: 'On plan', nairaAtRiskMinor: 0 },
      projects: [], signals: [], deliveries: { late: [], today: [], upcoming: [] },
      kpis: { activeProjects: 0, onSite: 0, plannedCrew: 0, openPoValueMinor: 0, criticalSignals: 0 },
      canMutate: false,
    }));
    expect(tabCount(html)).toBe(4);
    expect(html).toContain('aria-label="Construction overview sections"');
    expect(html).toMatch(/role="tabpanel"[^>]*hidden=""/);
    expect(html).toContain('What needs you today');
    expect(html).toContain('Delivery radar');
  });

  it('keeps New project globally available, outside hidden section panels', () => {
    const html = renderToStaticMarkup(createElement(ProjectsWorkspace, {
      projects: [], kpis: { total: 0, contractMinor: 0, budgetMinor: 0, committedMinor: 0 }, canMutate: true,
    }));
    expect(tabCount(html)).toBe(2);
    expect(html.indexOf('New project')).toBeLessThan(html.indexOf('role="tablist"'));
  });

  it('retains both approval empty states with separate inbox and all-request panels', () => {
    const html = renderToStaticMarkup(createElement(ApprovalsWorkspace, {
      requests: [], rules: [], reasons: [], kpis: { inbox: 0, inFlight: 0, overdue: 0, valueMinor: 0 }, canMutate: false,
    }));
    expect(tabCount(html)).toBe(4);
    expect(html).toContain('Your inbox is clear');
    expect(html).toContain('No requests');
    expect(html).toContain('Approval routes');
  });

  it('mounts all field forms and the outbox, so changing tabs preserves drafts', () => {
    const html = renderToStaticMarkup(createElement(FieldCapture, {
      projects: [], tasks: [], workers: [], todayISO: '2026-10-23',
    }));
    expect(tabCount(html)).toBe(6);
    expect(html).toContain('Submit report');
    expect(html).toContain('Raise issue');
    expect(html).toContain('Record progress');
    expect(html).toContain('Mobile evidence pack');
    expect(html).toContain('Quick attendance');
    expect(html).toContain('Device outbox');
    expect(html).toMatch(/role="tabpanel"[^>]*hidden=""/);
  });

  it('separates platform overview, tenant/system health, and audit activity', () => {
    const html = renderToStaticMarkup(createElement(PlatformOverview, {
      totals: { tenants: 0, units: 0, users: 0, mrrMinor: 0, incidents: 0, aiCostMinor: 0 },
      tenants: [], events: [], ai: { calls: 0, capPct: 0 }, systems: [],
    }));
    expect(tabCount(html)).toBe(3);
    expect(html).toContain('Tenant health &amp; systems');
    expect(html).toContain('Recent activity');
  });

  it('keeps digest and EVM empty states inside their page section', () => {
    expect(renderToStaticMarkup(createElement(DigestWorkspace, { views: [], canMutate: false }))).toContain('role="tabpanel"');
    expect(renderToStaticMarkup(createElement(EvmCockpit, { views: [] }))).toContain('role="tabpanel"');
  });
});
