import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ComplianceSetupDialog } from '@/components/inspections/compliance-setup-dialog';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';
import { RunInspectionDrawer } from '@/components/inspections/run-drawer';
import { ComplianceRegister } from '@/components/inspections/compliance-register';
import { ScheduleDialog } from '@/components/inspections/schedule-dialog';
import type { InspView, ObView, InspectionsData } from '@/components/inspections/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/facility-compliance', () => ({ createFacilityComplianceObligation: vi.fn(), updateFacilityComplianceObligation: vi.fn() }));
vi.mock('@/server/actions/inspections', () => ({ scheduleInspection: vi.fn(), runInspection: vi.fn(), rescheduleInspection: vi.fn() }));
const noop = () => {}, now = '2026-10-26', companyId = 'company-compliance';
const setup = { companyId, sites: [{ id: 'site', name: 'Victoria Facility' }], assets: [{ id: 'generator', siteId: 'site', name: 'Main generator' }] };
const empty: InspectionsData = { now, canMutate: true, companyId, setup, history: [], obligations: [], inspections: [] };
const obligation = { id: 'obligation', tenantId: companyId, siteId: 'site', estateId: 'site', assetId: 'generator', name: 'Generator review', scopeLabel: 'Main generator', criticality: 'important', cadenceDays: 30, templateKey: 'general', validUntil: '2026-10-25', authority: 'Recorded authority', configuration: { tenantId: companyId, obligationId: 'obligation', siteId: 'site', assetId: 'generator', version: 2, templateName: 'Generator operational check', checklist: [{ id: 'visual', label: 'Review fuel connection', severity: 'critical', requiresPhoto: true }], certificateReference: 'AUTHORITY-REF-01', nextOperationalDue: '2026-11-24', createdAt: '2026-10-26T12:00:00Z', updatedAt: '2026-10-26T12:00:00Z', createdBy: 'operator', updatedBy: 'operator' } } as ObView;
const inspection = { tenantId: companyId, id: 'inspection', ref: 'INS-1301', template: 'Generator operational check', obligationId: obligation.id, criticality: 'important', siteId: 'site', estateId: 'site', assetId: 'generator', assetName: 'Main generator', status: 'scheduled', scheduledDate: now, checklist: [{ id: 'visual', label: 'Review fuel connection', severity: 'critical', requiresPhoto: true, result: null }], passItems: 0, failItems: 0, inspector: 'Recorded inspector', raisedWorkOrders: 0, raisedWorkOrderRefs: [], operation: { tenantId: companyId, inspectionId: 'inspection', obligationId: obligation.id, version: 1, obligationVersion: 2, checklistHash: 'a'.repeat(64), scopeHash: 'b'.repeat(64), scheduledDate: now, cadenceDays: 30, evidenceIds: [] } } as unknown as InspView;

describe('native Facility compliance setup presentation', () => {
  it('shows an honest empty register with all three tabs and a create path', () => {
    const html = renderToStaticMarkup(createElement(InspectionsWorkspace, empty));
    for (const label of ['Add obligation', 'Compliance register', 'Inspections (0)', 'History', 'not assessed', 'No compliance obligations in scope', 'No configuration changes or inspection outcomes recorded yet.']) expect(html).toContain(label);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3); expect(html).not.toContain('100/ 100');
    expect(html).not.toContain('failure forecast'); expect(html).not.toContain('must be shut down');
  });
  it('provides actual locations/assets, a complete configurable checklist, labelled fields and explicit certificate limits', () => {
    const html = renderToStaticMarkup(createElement(ComplianceSetupDialog, { setup, now, onClose: noop }));
    for (const label of ['aria-label="Add compliance obligation"', 'Obligation name', 'Location', 'Victoria Facility', 'Main generator', 'Operational check interval (days)', 'Next operational check', 'Recorded certificate expiry (optional)', 'Certificate reference (optional)', 'Checklist preset', 'Inspection title', 'Check description', 'Failure severity', 'Image evidence required', 'Add checklist item', 'Create obligation', 'it never grants regulatory approval or extends a certificate']) expect(html).toContain(label);
    expect(html).not.toContain('Lagos State Safety Commission');
  });
  it('makes existing terms editable and renders operational due date separately from recorded expiry', () => {
    const form = renderToStaticMarkup(createElement(ComplianceSetupDialog, { setup, obligation, now, onClose: noop }));
    expect(form).toContain('Edit compliance obligation'); expect(form).toContain('Save obligation changes'); expect(form).toContain('AUTHORITY-REF-01');
    const html = renderToStaticMarkup(createElement(ComplianceRegister, { data: { ...empty, obligations: [obligation] }, onRun: noop, onSchedule: noop, onEdit: noop }));
    for (const label of ['expired 1d ago (2026-10-25)', 'Next operational check · 2026-11-24', 'Certificate reference · AUTHORITY-REF-01', 'Version 2', 'Edit obligation Generator review']) expect(html).toContain(label);
  });
  it('renders actual evidence uploads and finding notes for native inspections, with no demo count control', () => {
    const html = renderToStaticMarkup(createElement(RunInspectionDrawer, { inspection, expectedCompanyId: companyId, canMutate: true, onClose: noop }));
    for (const label of ['Result for Review fuel connection', 'Finding for Review fuel connection', 'Stored evidence', 'Add evidence file', 'Save evidence file', 'does not certify regulatory compliance or extend a certificate expiry']) expect(html).toContain(label);
    expect(html).not.toContain('Record demo evidence count'); expect(html).not.toContain('Evidence count is a demo input'); expect(html).toContain('disabled=""');
  });
  it('shows saved findings in a read-only completed record and keeps work-order follow-up in Estate when requested', () => {
    const completed: InspView = { ...inspection, status: 'failed', failItems: 1, checklist: [{ ...inspection.checklist[0], result: 'fail', note: 'Leaking fuel connection' }], raisedWorkOrders: 1, raisedWorkOrderRefs: ['WO/with space'] };
    const html = renderToStaticMarkup(createElement(RunInspectionDrawer, { inspection: completed, expectedCompanyId: companyId, canMutate: false, workOrderBasePath: '/estate/work-orders', onClose: noop }));
    expect(html).toContain('Leaking fuel connection'); expect(html).toContain('/estate/work-orders/WO%2Fwith%20space'); expect(html).not.toContain('Confirm inspection result');
  });
  it('keeps viewers out of mutation controls while retaining recorded dates and history', () => {
    const html = renderToStaticMarkup(createElement(InspectionsWorkspace, { ...empty, obligations: [obligation], inspections: [inspection], canMutate: false, history: [{ tenantId: companyId, actorId: 'operator', obligationId: 'obligation', action: 'inspection.operational_pass', at: '2026-10-26T12:00:00Z', note: 'Recorded operational outcome only; certificate validity unchanged.' }] }));
    for (const label of ['Add obligation', 'New inspection', 'Edit obligation Generator review', 'Run inspection for Generator review', 'Schedule inspection for Generator review']) expect(html).not.toContain(label);
    expect(html).toContain('certificate validity unchanged'); expect(html).toContain('Read-only');
  });
  it('labels a reschedule explicitly and retains the original inspector rather than recording a new visit', () => {
    const html = renderToStaticMarkup(createElement(ScheduleDialog, { obligations: [obligation], inspection, preselect: obligation.id, expectedCompanyId: companyId, now, onClose: noop }));
    expect(html).toContain('aria-label="Reschedule inspection"'); expect(html).toContain('Save inspection date'); expect(html).toContain('Recorded inspector');
    expect(html).toContain('does not renew a regulatory certificate'); expect(html).not.toContain('Create obligation');
  });
});
