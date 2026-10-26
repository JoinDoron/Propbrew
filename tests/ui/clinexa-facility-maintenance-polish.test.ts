import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceWorkspace } from '@/components/ppm/maintenance-workspace';
import { CalendarDayEvents, MaintenanceCalendar } from '@/components/ppm/calendar';
import { RuntimeView } from '@/components/ppm/runtime-view';
import { RiskPanel } from '@/components/ppm/risk-panel';
import { PpmList } from '@/components/ppm/list-view';
import { PlanDrawer } from '@/components/ppm/plan-drawer';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';
import { ComplianceRegister } from '@/components/inspections/compliance-register';
import { InspectionsList } from '@/components/inspections/inspections-list';
import { RunInspectionDrawer } from '@/components/inspections/run-drawer';
import { ScheduleDialog } from '@/components/inspections/schedule-dialog';
import type { PpmData } from '@/components/ppm/types';
import type { InspectionsData } from '@/components/inspections/types';
import { NOW, computeAllRisk } from '@/domain/ppm';
import { auditReadiness } from '@/domain/inspections';
import * as seed from '@/server/data/seed/fixtures';

const actions = vi.hoisted(() => ({
  logRuntimeReading: vi.fn(), generatePpmWorkOrder: vi.fn(), completePpmOccurrence: vi.fn(),
  reschedulePpmOccurrence: vi.fn(), decidePpmSuggestion: vi.fn(), scheduleInspection: vi.fn(), runInspection: vi.fn(),
}));
vi.mock('@/server/actions/ppm', () => actions);
vi.mock('@/server/actions/inspections', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const source = (name: string) => read(`src/components/${name}.tsx`);
const plain = (html: string) => html.replace(/<[^>]*>/g, '');
const escaped = (value: string) => plain(renderToStaticMarkup(createElement('span', null, value)));
const noop = () => {};
const tenant = seed.ppmPlans[0].tenantId;
const plans = seed.ppmPlans.filter((plan) => plan.tenantId === tenant);
const assets = seed.assets.filter((asset) => asset.tenantId === tenant);
const runtime = seed.assetRuntime.filter((row) => row.tenantId === tenant);
const ppm: PpmData = {
  now: NOW, canMutate: false, weeklyCapacityHours: 32,
  plans: plans.map((plan) => ({ ...plan, id: String(plan.id), assetId: String(plan.assetId), checklist: [...plan.checklist] })),
  occurrences: seed.ppmOccurrences.filter((row) => row.tenantId === tenant),
  runtime: runtime.map((row) => ({ ...row, assetName: assets.find((asset) => asset.id === row.assetId)!.name })),
  assessments: computeAllRisk({ assets, plans, runtime, workOrders: seed.workOrders.filter((row) => row.tenantId === tenant) }),
  gaps: [{ id: 'gap-gate', name: 'Gate — Main entrance', category: 'Access', locationLabel: 'Lekki Gardens', status: 'operational' }],
};
const inspections: InspectionsData = {
  now: NOW, canMutate: false, workOrderBasePath: '/estate/work-orders',
  inspections: seed.inspections.filter((row) => row.tenantId === tenant),
  obligations: seed.complianceObligations.filter((row) => row.tenantId === tenant),
};

const views = [
  'ppm/maintenance-workspace', 'ppm/calendar', 'ppm/runtime-view', 'ppm/risk-panel', 'ppm/list-view', 'ppm/plan-drawer',
  'inspections/inspections-workspace', 'inspections/compliance-register', 'inspections/inspections-list',
  'inspections/run-drawer', 'inspections/schedule-dialog',
] as const;

describe('Facility maintenance Clinexa polish', () => {
  it.each(views)('composes the %s interior with scoped reference styles and shared primitives', (name) => {
    const code = source(name);
    expect(code).toContain("'use client'");
    expect(code).toContain("'./maintenance-clinexa.module.css'");
    expect(code).toMatch(/<(?:Card|FacilityDialog)/);
    expect(code).not.toMatch(/(?:pb-filter|pb-table-frame|pb-panel-title|pb-dialog-title|pb-form-control|pb-action)/);
    expect(code).not.toMatch(/text-\[(?:8|9|10|11)(?:\.5)?px\]/);
    expect(code).not.toContain('sticky top-0');
  });

  it.each(['ppm', 'inspections'])('keeps %s spacing, typography, local scrolling and touch targets explicit', (directory) => {
    const css = read(`src/components/${directory}/maintenance-clinexa.module.css`);
    expect(css).toContain('gap: 24px');
    expect(css).toContain('gap: 16px');
    expect(css).toContain('padding: 24px');
    expect(css).toContain('padding: 16px');
    expect(css).toContain('font-size: 16px; font-weight: 500');
    expect(css).toContain('font-size: 14px');
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('border-radius: 12px');
    expect(css).toContain('height: 64px');
    expect(css).toContain('background: var(--surface-2)');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('min-height: 40px');
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('min-height: 44px');
    expect(css).not.toContain(':global');
  });

  it('preserves all four mounted maintenance sections and coverage/overdue records', () => {
    const html = renderToStaticMarkup(createElement(MaintenanceWorkspace, ppm));
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.match(/hidden=""/g)).toHaveLength(3);
    for (const label of ['Calendar', 'Runtime', 'AI risk', 'Plan register']) expect(html).toContain(label);
    expect(html).toContain('Maintenance coverage gaps');
    expect(html).toContain('Gate — Main entrance');
    expect(html).toContain('Access · Lekki Gardens');
    expect(html).toContain('Overdue maintenance');
    expect(html).toContain('aria-label="Overdue maintenance plans, scroll horizontally"');
    expect(html).toContain('Risk scores support planning');
    expect(html).toContain('review the asset condition before approving a date change');
    expect(html).not.toContain('never scrolls away');
    expect(html).not.toContain('Add plan · unavailable');
  });

  it('keeps incomplete plan creation visibly unavailable only to the existing mutation role', () => {
    const html = renderToStaticMarkup(createElement(MaintenanceWorkspace, { ...ppm, canMutate: true }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add plan · unavailable/);
    expect(html).toContain('New plan creation is not connected');
  });

  it('keeps a six-week Monday-first calendar, semantic navigation and full event names', () => {
    const occurrence = { ...ppm.occurrences[0], dueDate: NOW, generateDate: NOW, assetName: 'Generator — Long Lagos location (500kVA)' };
    const html = renderToStaticMarkup(createElement(MaintenanceCalendar, { data: { ...ppm, occurrences: [occurrence] }, onSelect: noop }));
    expect(html).toContain('July 2026');
    expect(html).toContain('Previous maintenance month');
    expect(html).toContain('Next maintenance month');
    expect(html).toContain('aria-label="Maintenance calendar, scroll horizontally for all days"');
    expect(html).toContain(`aria-label="${occurrence.assetName}, due ${NOW}, ${occurrence.status.replaceAll('_', ' ')}"`);
    expect(html).toContain('tabindex="0"');
    expect(source('ppm/calendar')).toContain('w < 6');
    expect(source('ppm/calendar')).toContain('length: 7');
    expect(source('ppm/calendar')).toContain('expanded ? occurrences : occurrences.slice(0, 3)');
    expect(source('ppm/calendar')).toContain('load / data.weeklyCapacityHours');
    expect(read('src/components/facility/facility-workspaces.module.css')).toContain('min-width: 960px');
  });

  it('expands crowded calendar days to every directly openable event with labelled reversible controls', () => {
    const occurrences = Array.from({ length: 5 }, (_, index) => ({ ...ppm.occurrences[0], id: `crowded-${index}`, dueDate: NOW, assetName: `Lagos asset ${index + 1}` }));
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const props = { id: 'calendar-events-crowded', date: NOW, occurrences, onSelect, onToggle };
    const collapsed = renderToStaticMarkup(createElement(CalendarDayEvents, { ...props, expanded: false }));
    expect(collapsed.match(/aria-label="Lagos asset /g)).toHaveLength(3);
    expect(collapsed).not.toContain('aria-label="Lagos asset 4');
    expect(collapsed).toContain(`aria-label="Show all 5 maintenance events for ${NOW}"`);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('aria-controls="calendar-events-crowded"');
    expect(collapsed).toContain('id="calendar-events-crowded"');

    const expandedDay = CalendarDayEvents({ ...props, expanded: true });
    const expanded = renderToStaticMarkup(expandedDay);
    expect(expanded.match(/aria-label="Lagos asset /g)).toHaveLength(5);
    expect(expanded).toContain(`aria-label="Show fewer maintenance events for ${NOW}"`);
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain('Show less');
    expandedDay.props.children[0].props.children[4].props.onClick();
    expect(onSelect).toHaveBeenCalledWith('crowded-4');
    expandedDay.props.children[1].props.onClick();
    expect(onToggle).toHaveBeenCalledOnce();

    const calendar = renderToStaticMarkup(createElement(MaintenanceCalendar, { data: { ...ppm, occurrences }, onSelect }));
    expect(calendar).toContain(`aria-label="Show all 5 maintenance events for ${NOW}"`);
    expect(source('ppm/calendar')).toContain('expandedDates.has(d)');
    expect(source('ppm/calendar')).toContain('if (next.has(d)) next.delete(d); else next.add(d)');
  });

  it('does not show unnecessary expansion controls on days with three or fewer events', () => {
    const html = renderToStaticMarkup(createElement(CalendarDayEvents, { id: 'calendar-short-day', date: NOW, occurrences: ppm.occurrences.slice(0, 3), expanded: false, onSelect: noop, onToggle: noop }));
    expect(html.match(/class="[^\"]*event_/g)).toHaveLength(3);
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('Show all');
  });

  it('retains exact runtime readings and whichever-first service calculations', () => {
    const html = renderToStaticMarkup(createElement(RuntimeView, { data: ppm, onSelect: noop }));
    const text = plain(html);
    expect(text).toContain('238 / 250h');
    expect(text).toContain('12 running-hrs (~2d)');
    expect(text).toContain('2026-07-28');
    expect(text).toContain('Runtime-driven');
    expect(text).toContain('whichever comes first');
    expect(html).not.toContain('Log runtime');
    expect(html).not.toContain('Generate WO');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('does not replace manual runtime entry with invented connected readings', () => {
    const html = renderToStaticMarkup(createElement(RuntimeView, { data: { ...ppm, canMutate: true }, onSelect: noop }));
    expect(html).toContain('Log runtime');
    expect(html).toContain('Details →');
    expect(source('ppm/runtime-view')).toContain('Number(hours)');
    expect(source('ppm/runtime-view')).toContain('not a connected meter reading');
  });

  it('renders every risk driver without truncation or automatic AI approval', () => {
    const assessment = ppm.assessments.find((row) => row.suggestedDate && !row.shadow)!;
    const data = { ...ppm, assessments: [assessment] };
    const html = renderToStaticMarkup(createElement(RiskPanel, { data }));
    for (const driver of assessment.drivers) expect(html).toContain(escaped(driver.label));
    expect(html).toContain(`aria-label="Review risk signals for ${assessment.assetName}"`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Signal completeness');
    expect(html).toContain('only the Facility Manager can approve');
    expect(html).not.toContain('Review approval</button>');
    const mutable = renderToStaticMarkup(createElement(RiskPanel, { data: { ...data, canMutate: true } }));
    expect(mutable).toContain('Review approval');
    expect(mutable).toContain('Keep calendar date');
    expect(source('ppm/risk-panel')).toContain('Confirm decision');
    expect(source('ppm/risk-panel')).toContain('not a calibrated probability or certified failure prediction');
    expect(source('ppm/risk-panel')).not.toContain('truncate');
  });

  it('keeps shadow-mode risk advisory with the calendar unaffected', () => {
    const assessment = { ...ppm.assessments[0], shadow: true, confidence: .5, suggestedDate: '2026-08-01' };
    const html = renderToStaticMarkup(createElement(RiskPanel, { data: { ...ppm, canMutate: true, assessments: [assessment] } }));
    expect(html).toContain('Shadow mode');
    expect(html).toContain('only 2 of 4 signals present');
    expect(html).toContain('standard calendar is unaffected');
    expect(html).not.toContain('Review approval</button>');
  });

  it('retains one maintenance-register row per open plan with eight scoped headers', () => {
    const html = renderToStaticMarkup(createElement(PpmList, { data: ppm, onSelect: noop }));
    const count = ppm.plans.filter((plan) => ppm.occurrences.some((row) => row.planId === plan.id && row.status !== 'completed')).length;
    expect(html.match(/scope="col"/g)).toHaveLength(8);
    expect(html.match(/<tr[ >]/g)).toHaveLength(count + 1);
    expect(html).toContain('aria-label="Maintenance plan register"');
    expect(html).toContain('tabindex="0"');
    for (const plan of ppm.plans) expect(html).toContain(`View maintenance plan for ${plan.assetName}`);
    expect(source('ppm/list-view')).not.toMatch(/<tr[^>]*onClick/);
  });

  it('keeps native plan details and statutory facts without a second sticky title', () => {
    const plan = ppm.plans.find((row) => row.statutory)!;
    const occ = ppm.occurrences.find((row) => row.planId === plan.id)!;
    const html = renderToStaticMarkup(createElement(PlanDrawer, { plan, occ, risk: null, canMutate: false, onClose: noop }));
    expect(html).toContain('<dialog');
    expect(html).toContain(`aria-label="${plan.assetName}"`);
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).toContain('<dt>Legal deadline</dt>');
    expect(html).toContain(plan.statutoryDeadline!);
    expect(html).toContain(plan.assignee);
    expect(html).toContain('Read-only');
    expect(html).not.toContain('Reschedule</button>');
    expect(html).not.toContain('Mark serviced…');
    expect(source('ppm/plan-drawer')).toContain('Reschedule service date');
    expect(source('ppm/plan-drawer')).toContain('Confirm service completion');
    expect(source('ppm/plan-drawer')).toContain('No photo file is uploaded or verified');
  });

  it('preserves both mounted inspection sections, audit arithmetic and unavailable audit export', () => {
    const html = renderToStaticMarkup(createElement(InspectionsWorkspace, inspections));
    const audit = auditReadiness(inspections.obligations);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html.match(/hidden=""/g)).toHaveLength(1);
    expect(html).toContain('Audit readiness');
    expect(plain(html)).toContain(`${audit.score}/ 100`);
    expect(html).toContain('Compliance register');
    expect(html).toContain(`Inspections (${inspections.inspections.length})`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Export audit pack · unavailable/);
    expect(html).not.toContain('New inspection</button>');
    expect(source('inspections/inspections-workspace')).toContain('className={styles.auditMetrics}');
    const inspectionCss = readFileSync(resolve(process.cwd(), 'src/components/inspections/maintenance-clinexa.module.css'), 'utf8');
    expect(inspectionCss).toMatch(/\.auditMetrics\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('preserves every compliance expiry, authority and last-inspection view with existing grants', () => {
    const html = renderToStaticMarkup(createElement(ComplianceRegister, { data: inspections, onRun: noop, onSchedule: noop }));
    for (const obligation of inspections.obligations) {
      expect(plain(html)).toContain(obligation.name.replace('&', '&amp;'));
      if (obligation.authority) expect(html).toContain(obligation.authority);
      if (obligation.validUntil) expect(html).toContain(obligation.validUntil);
    }
    expect(html.indexOf('CCTV data-protection')).toBeLessThan(html.indexOf('Lift statutory inspection'));
    expect(html).toContain('no certificate on file');
    expect(html).not.toContain('Run</button>');
    expect(html).not.toContain('Schedule</button>');
    const mutable = renderToStaticMarkup(createElement(ComplianceRegister, { data: { ...inspections, canMutate: true }, onRun: noop, onSchedule: noop }));
    expect(mutable).toContain('Run inspection for');
    expect(mutable).toContain('Schedule inspection for');
  });

  it('uses pressed shared status filters and an accessible seven-column inspection register', () => {
    const html = renderToStaticMarkup(createElement(InspectionsList, { data: inspections, onRun: noop }));
    expect(html).toContain('aria-label="Filter inspections by status"');
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/scope="col"/g)).toHaveLength(7);
    expect(html.match(/<tr[ >]/g)).toHaveLength(inspections.inspections.length + 1);
    expect(html).toContain('aria-label="Inspection register"');
    expect(html).toContain('tabindex="0"');
    for (const row of inspections.inspections) expect(html).toContain(`View inspection ${row.ref}`);
    expect(html).not.toContain('Run</button>');
    expect(source('inspections/inspections-list')).not.toMatch(/<tr[^>]*onClick/);
  });

  it('keeps failed inspection follow-up in the originating Estate portal', () => {
    const failed = inspections.inspections.find((row) => row.raisedWorkOrderRefs.length)!;
    const html = renderToStaticMarkup(createElement(RunInspectionDrawer, { inspection: { ...failed, raisedWorkOrderRefs: ['WO/with space'] }, canMutate: false, workOrderBasePath: '/estate/work-orders', onClose: noop }));
    expect(html).toContain('<dialog');
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).toContain('Auto-raised work orders');
    expect(html).toContain('/estate/work-orders/WO%2Fwith%20space');
    expect(html).not.toContain('Review inspection result');
  });

  it('keeps runnable checklist results individually labelled and incomplete until reviewed', () => {
    const inspection = inspections.inspections.find((row) => row.status === 'overdue')!;
    const clean = { ...inspection, checklist: inspection.checklist.map((item) => ({ ...item, result: null })) };
    const html = renderToStaticMarkup(createElement(RunInspectionDrawer, { inspection: clean, canMutate: true, onClose: noop }));
    expect(html).toContain('<fieldset');
    for (const item of clean.checklist) expect(html).toContain(`aria-label="Result for ${escaped(item.label)}"`);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(clean.checklist.length * 3);
    expect(html).toContain(`${clean.checklist.length} item(s) left`);
    expect(html).toContain('No photo file is uploaded or verified');
    expect(source('inspections/run-drawer')).toContain('Confirm inspection result');
    expect(source('inspections/run-drawer')).toContain('disabled={pending}');
  });

  it('keeps schedule fields labelled, preselected and explicit about failure work orders', () => {
    const selected = inspections.obligations[1];
    const html = renderToStaticMarkup(createElement(ScheduleDialog, { obligations: inspections.obligations, preselect: selected.id, now: NOW, onClose: noop }));
    expect(html).toContain('aria-label="Schedule inspection"');
    expect(html).toContain(`<option value="${selected.id}" selected=""`);
    expect(html).toContain(`value="${NOW}"`);
    expect(html.match(/<label/g)).toHaveLength(3);
    expect(html).toContain('failures raise work orders');
    expect(html).toContain('Schedule</button>');
  });

  it('provides helpful empty states across all inner registers without invented records', () => {
    const emptyPpm = { ...ppm, plans: [], occurrences: [], runtime: [], assessments: [], gaps: [] };
    const emptyInspections = { ...inspections, inspections: [], obligations: [] };
    expect(renderToStaticMarkup(createElement(PpmList, { data: emptyPpm, onSelect: noop }))).toContain('No open maintenance occurrences');
    expect(renderToStaticMarkup(createElement(RuntimeView, { data: emptyPpm, onSelect: noop }))).toContain('No runtime-metered assets');
    expect(renderToStaticMarkup(createElement(RiskPanel, { data: emptyPpm }))).toContain('No maintenance risk signals');
    expect(renderToStaticMarkup(createElement(ComplianceRegister, { data: emptyInspections, onRun: noop, onSchedule: noop }))).toContain('No compliance obligations');
    expect(renderToStaticMarkup(createElement(InspectionsList, { data: emptyInspections, onRun: noop }))).toContain('No inspections match');
  });

  it('retains pending-close protection, duplicate guards and recoverable in-dialog errors', () => {
    for (const file of ['ppm/plan-drawer', 'ppm/runtime-view', 'ppm/risk-panel', 'inspections/run-drawer', 'inspections/schedule-dialog']) {
      const code = source(file);
      expect(code).toContain('pending={pending}');
      expect(code).toContain('if (pending');
      expect(code).toContain('role="alert"');
      expect(code).toContain('catch');
    }
    const dialog = source('facility/facility-ui');
    expect(dialog).toContain('canClose={!pending}');
    expect(dialog).toContain('dismissOnBackdrop={false}');
  });

  it('does not submit any runtime, maintenance, inspection or AI action during read-only QA', () => {
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });
});
