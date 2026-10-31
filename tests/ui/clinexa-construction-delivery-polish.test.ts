import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleWorkspace } from '@/components/construction/schedule-workspace';
import { SiteWorkspace } from '@/components/construction/site-workspace';
import { TwinWorkspace } from '@/components/construction/twin-workspace';
import { ProjectsWorkspace } from '@/components/construction/projects-workspace';
import { FieldCapture } from '@/components/construction/field-capture';
import { SafetyWorkspace } from '@/components/construction/safety-workspace';
import { WorkforceWorkspace } from '@/components/construction/workforce-workspace';
import { TimesheetsWorkspace } from '@/components/construction/timesheets-workspace';
import { constructionNaira } from '@/components/construction/construction-ui';
import type { OutboxOp } from '@/domain/sync';

const actions = vi.hoisted(() => ({ updateTaskProgress: vi.fn(), advanceMilestone: vi.fn(), escalateTaskToIssue: vi.fn(), submitReport: vi.fn(), reviewReport: vi.fn(), approveDailyReport: vi.fn(), returnDailyReport: vi.fn(), createProject: vi.fn(), clockWorker: vi.fn(), submitTimesheet: vi.fn(), approveTimesheet: vi.fn(), rejectTimesheet: vi.fn() }));
const device = vi.hoisted(() => ({ ops: [] as OutboxOp[], online: true, capture: vi.fn(), removeOp: vi.fn(), clearSynced: vi.fn(), abandon: vi.fn(), requeue: vi.fn(), setForcedOffline: vi.fn() }));
vi.mock('@/server/actions/construction', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/offline/outbox', () => ({ ...device, useOutbox: () => device.ops, useOnline: () => device.online, isForcedOffline: () => false }));

const source = (name: string) => readFileSync(resolve(process.cwd(), `src/components/construction/${name}.tsx`), 'utf8');
const css = () => readFileSync(resolve(process.cwd(), 'src/components/construction/construction-delivery-polish.module.css'), 'utf8');
const text = (html: string) => html.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&');
const names = ['schedule-workspace', 'site-workspace', 'twin-workspace', 'projects-workspace', 'field-capture', 'safety-workspace', 'workforce-workspace', 'timesheets-workspace'];
const schedule: ComponentProps<typeof ScheduleWorkspace> = { projectName: 'Lagos Waterfront', canMutate: false, canCreate: false, tasks: [{ id: 'task-one', name: 'Complete the full-length reinforced concrete inspection', owner: 'Samuel Chukwuemeka Omosehin', phase: 'Superstructure', plannedStartISO: '2026-10-23', plannedFinishISO: '2026-11-02', actualStartISO: '2026-10-24', percentComplete: 0, status: 'blocked', critical: true, slackDays: 0, offsetDays: 5, durationDays: 10, downstream: ['task-two'] }], milestones: [{ id: 'mile-one', name: 'Structural completion and independent inspection', dueISO: '2027-01-02', status: 'planned', band: 'info' }], kpis: { durationDays: 15, criticalCount: 1, blocked: 1, forecastFinishISO: '2027-01-02', slipDays: 2, plannedFinishISO: '2026-12-31' } };
const report: ComponentProps<typeof SiteWorkspace>['reports'][number] = { id: 'report-one', projectName: 'Lagos Waterfront', dateISO: '2026-10-23', weather: 'Rain clearing in the afternoon', shift: 'day', officer: 'Adeola Samuel Omosehin', workforceCount: 12, completed: ['Complete recorded activity'], ongoing: ['Ongoing recorded activity'], delayed: ['Delayed recorded activity'], plannedNext: ['Next recorded activity'], deliveries: ['Cement delivery recorded'], incidents: ['Recorded incident'], constraints: ['Full recorded constraint description'], photos: 3, status: 'approved', band: 'success', completenessPct: 90, missing: ['Supervisor note'], attendanceCount: 10, inconsistent: true };
const site: ComponentProps<typeof SiteWorkspace> = { reports: [report], gaps: Array.from({ length: 7 }, (_, index) => `Reporting gap reference ${index + 1}`), kpis: { approved: 1, pending: 0, coverage: 90, incidents: 1 }, canMutate: false };
const twin: ComponentProps<typeof TwinWorkspace> = { zones: [{ id: 'lower', level: 1, label: 'Level one complete full-length building zone label', block: 'Block One', layers: { structure: 100, blockwork: 50, mep: 25, finishes: 0 }, progress: 44, band: 'warn', openIssues: 2, openRfis: 3, tasks: [{ name: 'Complete full-length task name in the selected level', percentComplete: 20, status: 'blocked' }] }, { id: 'upper', level: 2, label: 'Level two upper working face', block: 'Block One', layers: { structure: 50, blockwork: 0, mep: 0, finishes: 0 }, progress: 13, band: 'warn', openIssues: 0, openRfis: 0, tasks: [] }], projectName: 'Lagos Waterfront', kpis: { levels: 2, avgProgress: 29, topped: 1, activeLevel: 2, openIssues: 2 } };
const project: ComponentProps<typeof ProjectsWorkspace>['projects'][number] = { id: 'project-one', name: 'Lagos Waterfront Construction Project', code: 'LAG-001', location: 'Lekki, Lagos', clientName: 'Lagos Development Company', pmName: 'Adeola Omosehin', status: 'active', contractMinor: 100000025, budgetMinor: 90000025, committedMinor: 80000025, actualMinor: 70000025, percentComplete: 40, plannedPercent: 50, cpi: .89, spi: .8, healthScore: 60, healthBand: 'warn', healthLabel: 'Review required', startISO: '2026-01-02', plannedFinishISO: '2026-12-31', forecastFinishISO: '2027-01-02', slipDays: 2, milestones: schedule.milestones, investorProjectId: 'investor-one' };
const projects: ComponentProps<typeof ProjectsWorkspace> = { projects: [project], kpis: { total: 1, contractMinor: project.contractMinor, budgetMinor: project.budgetMinor, committedMinor: project.committedMinor }, canMutate: false };
const worker: ComponentProps<typeof WorkforceWorkspace>['workers'][number] = { id: 'worker-one', name: 'Chukwuemeka Samuel Omosehin', trade: 'Reinforced concrete inspection', kind: 'subcontractor', crew: 'Waterfront Superstructure Crew', company: 'Independent Structural Services Nigeria', dayRateMinor: 12345, certName: 'Full certificate reference name', certExpiryISO: '2026-10-20', certDays: -3, certBand: 'danger', status: 'present', method: 'Manual attendance entry', withinGeofence: false, clockIn: '07:00' };
const workforce: ComponentProps<typeof WorkforceWorkspace> = { workers: [worker], byTrade: [{ trade: worker.trade, present: 1, total: 2 }], kpis: { present: 1, planned: 2, shortfall: 1, dayCostMinor: 12345, certAlerts: 1 }, projectName: 'Lagos Waterfront', projectId: 'project-one', canMutate: false };
const sheet: ComponentProps<typeof TimesheetsWorkspace>['sheets'][number] = { id: 'sheet-one', ref: 'TS-001', workerName: worker.name, weekEndingISO: '2026-10-23', costCode: 'LAG-STR', normalHours: 40, overtimeHours: 2.5, status: 'submitted', submittedBy: 'Full Supervisor Name', approvedBy: 'Full Approver Name', approvedISO: '2026-10-23T23:30:00Z', costMinor: 1234567, band: 'warn', dayRateMinor: 12345 };
const timesheets: ComponentProps<typeof TimesheetsWorkspace> = { sheets: [sheet], byCode: [{ code: 'LAG-STR', name: 'Complete Structural Labour Cost Code', postedMinor: 100001, pendingMinor: 1234567, hours: 42.5, actualMinor: 200001, budgetMinor: 10000025 }], posture: { postedMinor: 100001, pendingMinor: 1234567, pendingSheets: 1, overtimeHours: 2.5 }, projectName: 'Lagos Waterfront', canMutate: false };
const safety: ComponentProps<typeof SafetyWorkspace> = { permits: [{ id: 'permit-one', ref: 'PTW-001', type: 'height', location: 'Full named work area on the upper roof', requestedBy: 'Full Requester Name', supervisor: 'Full Responsible Supervisor Name', status: 'active', validFromISO: '2026-12-31T23:00:00Z', validToISO: '2027-01-01T10:00:00Z', controls: ['First full recorded safety control', 'Second full recorded safety control'], expired: false, clash: true }], events: [{ id: 'event-one', kind: 'near_miss', title: 'Complete recorded safety event title', atISO: '2026-10-23T23:30:00Z', reportedBy: 'Full Reporter Name', lostDays: 0, closed: false, action: 'Complete recorded corrective action description', zoneLabel: 'Upper roof work area' }], talks: [{ id: 'talk-one', topic: 'Full toolbox briefing topic', atISO: '2026-10-23', attendees: 12, deliveredBy: 'Full Facilitator Name' }], clashes: [{ aRef: 'PTW-001', bRef: 'PTW-002', location: 'Upper roof work area', aType: 'height', bType: 'hot_work' }], stats: { daysSinceLTI: null, lostTimeEvents: 0, nearMisses: 1, activePermits: 1, expiredPermits: 0, talksThisMonth: 1, score: 75, band: 'warn' }, projectName: 'Lagos Waterfront' };
const field: ComponentProps<typeof FieldCapture> = { projects: [{ id: 'project-one', name: 'Lagos Waterfront', code: 'LAG-001' }], tasks: [{ id: 'task-one', projectId: 'project-one', name: schedule.tasks[0].name, percentComplete: 40 }], workers: Array.from({ length: 8 }, (_, index) => ({ id: `worker-${index}`, name: `Full Worker Number ${index + 1}`, trade: 'Construction trade', projectId: 'project-one' })), todayISO: '2026-10-23', canCapture: false };

beforeEach(() => { vi.clearAllMocks(); device.ops = []; device.online = true; });

describe('Construction delivery Clinexa composition', () => {
  it.each(names)('deeply composes %s without compressed or truncated primary records', (name) => {
    const code = source(name);
    expect(code).toContain("'./construction-delivery-polish.module.css'");
    expect(code).toContain('<CardHeader');
    expect(code).toContain('<ConstructionFrame>');
    expect(code).not.toContain('truncate');
    expect(code).not.toMatch(/text-\[(?:8|9|10|11)(?:\.5)?px\]/);
    expect(code).not.toContain('pb-dialog-title');
    expect(code).not.toContain('fixed inset-0');
  });

  it('uses scoped reference rhythm, pale rounded headers, full table rows and touch-sized controls', () => {
    for (const token of ['gap: 24px', 'gap: 16px', 'padding: 24px', 'padding: 16px', 'font-size: 14px', 'font-size: 12px', 'font-size: 16px; font-weight: 500', 'border-radius: 12px', 'border-radius: 10px', 'var(--radius-card) var(--radius-card) 0 0', 'height: 64px', 'min-height: 40px', 'min-height: 44px', 'overflow-x: auto', 'focus-visible']) expect(css()).toContain(token);
    expect(css()).not.toContain(':global');
  });

  it.each([
    ['schedule-workspace', ['network', 'milestones', 'overview']], ['site-workspace', ['reports', 'issues', 'diary', 'overview']],
    ['twin-workspace', ['building', 'overview']], ['projects-workspace', ['register', 'overview']],
    ['field-capture', ['report', 'issue', 'progress', 'evidence', 'attendance', 'queue']], ['safety-workspace', ['permits', 'events', 'overview']],
    ['workforce-workspace', ['attendance', 'overview']], ['timesheets-workspace', ['sheets', 'costs', 'overview']],
  ])('preserves every %s tab ID and its original order', (name, ids) => {
    const code = source(name as string); let previous = -1;
    for (const id of ids) { const position = code.indexOf(`id: '${id}'`); expect(position).toBeGreaterThan(previous); previous = position; }
  });

  it('keeps all 24 delivery panels mounted without a global demo or snapshot banner', () => {
    const screens = [[renderToStaticMarkup(createElement(ScheduleWorkspace, schedule)), 4], [renderToStaticMarkup(createElement(SiteWorkspace, site)), 4], [renderToStaticMarkup(createElement(TwinWorkspace, twin)), 2], [renderToStaticMarkup(createElement(ProjectsWorkspace, projects)), 2], [renderToStaticMarkup(createElement(FieldCapture, field)), 6], [renderToStaticMarkup(createElement(SafetyWorkspace, safety)), 3], [renderToStaticMarkup(createElement(WorkforceWorkspace, workforce)), 2], [renderToStaticMarkup(createElement(TimesheetsWorkspace, timesheets)), 3]] as const;
    for (const [html, count] of screens) { expect(html.match(/role="tabpanel"/g)).toHaveLength(count); expect(html.match(/hidden=""/g)).toHaveLength(count - 1); expect(html).not.toContain('Recorded snapshot'); expect(html).not.toContain('Company records'); expect(html).not.toMatch(/NaN|Infinity|undefined/); }
  });

  it('keeps zero progress truly zero while preserving CPM offsets, duration, float and cascade controls', () => {
    const html = renderToStaticMarkup(createElement(ScheduleWorkspace, schedule));
    for (const value of [schedule.tasks[0].name, schedule.tasks[0].owner, '23 Oct 2026', '2 Nov 2026', '24 Oct 2026', '0%']) expect(html).toContain(value);
    expect(html).toContain('width:0%');
    expect(html).toContain('aria-label="Construction task network, horizontally scrollable"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('Update progress for');
    for (const token of ['(t.offsetDays / span) * 100', '(t.durationDays / span) * 100', 'Math.max(0,', 'cascade.has(t.id)', 'onFocus={() => setHover(t.id)}', 'onBlur={() => setHover(null)}']) expect(source('schedule-workspace')).toContain(token);
    expect(source('schedule-workspace')).toContain('canCreate &&');
    expect(source('schedule-workspace')).toContain('Confirm create site issue');
    expect(renderToStaticMarkup(createElement(ScheduleWorkspace, { ...schedule, canMutate: true }))).toContain(`Update progress for ${schedule.tasks[0].name}`);
  });

  it('shows every reporting gap and every approved diary field without inferring verified evidence', () => {
    const html = renderToStaticMarkup(createElement(SiteWorkspace, site));
    for (const gap of site.gaps) expect(html).toContain(gap);
    for (const value of [report.officer, report.weather, ...report.completed, ...report.ongoing, ...report.delayed, ...report.plannedNext, ...report.deliveries, ...report.incidents, ...report.constraints]) expect(html).toContain(value);
    expect(html).toContain('recorded attendance (10)');
    expect(html).toContain('90% report-field completeness, not evidence verification');
    expect(source('site-workspace')).not.toContain('gaps.slice');
    expect(html).not.toContain('geofenced attendance');
    const mutableReport = { ...report, status: 'submitted', band: 'info' as const };
    expect(renderToStaticMarkup(createElement(SiteWorkspace, { ...site, reports: [mutableReport] }))).not.toContain(' Review</button>');
    expect(renderToStaticMarkup(createElement(SiteWorkspace, { ...site, reports: [mutableReport], canMutate: true }))).toContain(' Review</button>');
  });

  it('formats date-only reporting gaps in WAT while retaining descriptive references', () => {
    const html = renderToStaticMarkup(createElement(SiteWorkspace, { ...site, gaps: ['2026-10-23', 'Reference awaiting officer clarification'] }));
    expect(html).toContain('<time dateTime="2026-10-23">23 Oct 2026 · WAT</time>');
    expect(html).toContain('Reference awaiting officer clarification');
  });

  it('retains sorted twin levels, four equal trade slabs, exact progress and explicit issue/RFI labels', () => {
    const html = renderToStaticMarkup(createElement(TwinWorkspace, twin));
    expect(html.indexOf(twin.zones[1].label)).toBeLessThan(html.indexOf(twin.zones[0].label));
    expect(html).toContain('44% complete, 2 open issues, 3 unanswered RFIs');
    expect(html).toContain('2 issues'); expect(html).toContain('3 RFIs');
    expect(html).toContain('aria-label="Building trade layer"');
    expect(html).toContain('aria-label="Building levels and trade progress, horizontally scrollable"');
    expect(html).toContain('not a connected BIM or live sensor feed');
    expect(css()).toContain('width: 25%');
    const slab = css().match(/\.slab \{([^}]+)\}/)?.[1];
    expect(slab).toContain('flex: none'); expect(slab).toContain('min-height: 44px'); expect(slab).toContain('height: 44px');
    for (const token of ['z.layers[l.key]', 'layer === \'all\' ? z.progress : z.layers[layer]', 'aria-pressed={active}', 'setSel(active ? null : z.id)', 'zone.tasks.map']) expect(source('twin-workspace')).toContain(token);
  });

  it('keeps full project finance and start/planned/forecast dates exact to kobo', () => {
    const html = renderToStaticMarkup(createElement(ProjectsWorkspace, projects));
    for (const minor of [project.contractMinor, project.budgetMinor, project.committedMinor, project.actualMinor]) expect(html).toContain(constructionNaira(minor));
    for (const value of [project.name, project.clientName, project.pmName, '2 Jan 2026', '31 Dec 2026', '2 Jan 2027', 'CPI 0.89', 'SPI 0.80', schedule.milestones[0].name]) expect(html).toContain(value);
    expect(html).toContain('not independent site verification');
    expect(html).not.toContain('New project</button>');
    expect(renderToStaticMarkup(createElement(ProjectsWorkspace, { ...projects, canMutate: true }))).toContain('New project</button>');
    expect(source('projects-workspace')).toContain('Number(e.target.value) || 0');
    expect(source('projects-workspace')).toContain('step="0.01"');
  });

  it('provides a complete semantic workforce register with honest manual/geofence and certification facts', () => {
    const html = renderToStaticMarkup(createElement(WorkforceWorkspace, workforce));
    for (const value of [worker.name, worker.trade, worker.company!, worker.crew!, worker.certName!, constructionNaira(worker.dayRateMinor), '20 Oct 2026', 'Expired 3 days ago', 'Not verified', 'Manual attendance entry', '07:00 WAT']) expect(html).toContain(value);
    expect(html.match(/scope="col"/g)).toHaveLength(8); expect(html).toContain('scope="row"');
    expect(html).toContain('aria-label="Construction workforce attendance register, horizontally scrollable"');
    expect(html).not.toContain(`Mark absent ${worker.name}`);
    expect(renderToStaticMarkup(createElement(WorkforceWorkspace, { ...workforce, canMutate: true }))).toContain(`Mark absent ${worker.name}`);
    expect(source('workforce-workspace')).toContain('clockWorker(w.id, projectId, w.status !== \'present\')');
    expect(source('workforce-workspace')).not.toContain('Certified work is blocked');
    expect(html).toContain('1/2 present / allocated');
  });

  it.each(['manual', 'offline'])('never infers geofence location from a %s attendance capture', (method) => {
    for (const withinGeofence of [true, false, undefined]) {
      const html = renderToStaticMarkup(createElement(WorkforceWorkspace, { ...workforce, workers: [{ ...worker, method, withinGeofence }] }));
      expect(html).toMatch(/<td[^>]*>Not verified<\/td>/);
      expect(html).not.toContain('Recorded inside'); expect(html).not.toContain('Recorded outside');
    }
  });

  it.each(['gps', 'qr'])('preserves the recorded inside, outside and unknown geofence states for %s captures', (method) => {
    for (const [withinGeofence, expected] of [[true, 'Recorded inside'], [false, 'Recorded outside'], [undefined, 'Not recorded']] as const) {
      const html = renderToStaticMarkup(createElement(WorkforceWorkspace, { ...workforce, workers: [{ ...worker, method, withinGeofence }] }));
      expect(html).toMatch(new RegExp(`<td[^>]*>${expected}</td>`));
      expect(html).not.toContain('Not verified');
    }
  });

  it('shows missing credential/geofence values as missing instead of inventing valid or zero-day evidence', () => {
    const html = renderToStaticMarkup(createElement(WorkforceWorkspace, { ...workforce, workers: [{ ...worker, certName: undefined, certDays: null, certExpiryISO: undefined, withinGeofence: undefined, clockIn: undefined, method: undefined }] }));
    expect(html).toContain('Expiry not recorded'); expect(html).toContain('Clock time not recorded');
    expect(html).toContain('Capture method not recorded'); expect(html).not.toContain('0 days left');
    expect(html).not.toContain('Recorded inside');
  });

  it('retains timesheet hours, submitted/approved identity, WAT timestamps and cost-posting semantics', () => {
    const html = renderToStaticMarkup(createElement(TimesheetsWorkspace, timesheets));
    for (const value of [sheet.ref, sheet.workerName, sheet.submittedBy, sheet.approvedBy!, '40h normal', '2.5h overtime @1.5×', '24 Oct 2026, 00:30 WAT', constructionNaira(sheet.costMinor), constructionNaira(sheet.dayRateMinor)]) expect(text(html)).toContain(value);
    expect(html.match(/scope="col"/g)).toHaveLength(8); expect(html).toContain('scope="row"');
    expect(html).toContain('Construction timesheet register, horizontally scrollable');
    expect(html).toContain('not proof of paid wages or bank settlement');
    expect(html).not.toContain('Approve &amp; post</button>');
    const mutable = renderToStaticMarkup(createElement(TimesheetsWorkspace, { ...timesheets, canMutate: true }));
    expect(mutable).toContain('Approve &amp; post');
    for (const token of ['approveTimesheet(s.id)', 'submitTimesheet(s.id)', 'rejectTimesheet(sheet.id, reason)', 'it does not pay wages', 'Math.min(100, (c.actualMinor / max) * 100)', 'Math.min(100, (c.pendingMinor / max) * 100)', 'c.actualMinor + c.pendingMinor']) expect(source('timesheets-workspace')).toContain(token);
  });

  it('keeps complete permit windows, recorded controls and event corrective actions without live safety claims', () => {
    const html = renderToStaticMarkup(createElement(SafetyWorkspace, safety));
    for (const value of [safety.permits[0].location, safety.permits[0].requestedBy, safety.permits[0].supervisor, ...safety.permits[0].controls, safety.events[0].title, safety.events[0].action!, safety.events[0].reportedBy, safety.talks[0].topic, safety.talks[0].deliveredBy, '1 Jan 2027, 00:00', '1 Jan 2027, 11:00']) expect(html).toContain(value);
    expect(html).toContain('Recorded permit overlap'); expect(html).toContain('Recorded clash');
    expect(html).toContain('No lost-time injury on record'); expect(html).toContain('not an independent safety certification');
    expect(html).not.toContain('are both live'); expect(source('safety-workspace')).not.toContain('validFromISO.slice');
  });

  it('shows every quick-attendance worker, explicit manual defaults, labelled forms and a capture-denied boundary', () => {
    const html = renderToStaticMarkup(createElement(FieldCapture, field));
    expect(html).toContain('No queued changes on this device.');
    expect(html).not.toContain('Everything captured on this device is on the server.');
    for (const worker of field.workers) expect(html).toContain(worker.name);
    expect(html).toContain('recorded 07:00 WAT clock-in');
    expect(html).toContain('does not verify physical presence or a geofence');
    expect(html.match(/<fieldset disabled=""/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Attach site photos"');
    expect(html).toContain('aria-valuetext="40% complete"');
    expect(html).toContain('quota or storage failures can prevent persistence');
    expect(source('field-capture')).not.toContain('workers.slice');
    for (const token of ["capture(owner, 'daily_report'", "capture(owner, 'site_issue'", "capture(owner, 'task_progress'", "capture(owner, 'attendance'", 'clockIn: \'07:00\'', 'projectId: task?.projectId', 'projectId: w.projectId', 'photos.length', '}, photos)']) expect(source('field-capture')).toContain(token);
  });

  it('retains full device IDs, year-aware WAT timestamps, attachment counts and conflict actions', () => {
    device.ops = [{ id: 'full-client-idempotency-key-123456789', kind: 'daily_report', label: 'Complete queued daily report label', payload: {}, capturedISO: '2026-10-23T23:30:00Z', attachments: 3, status: 'conflict', attempts: 2, error: 'Recorded conflict detail', serverState: 'Full existing server record description' }];
    const html = renderToStaticMarkup(createElement(FieldCapture, field));
    for (const value of [device.ops[0].id, device.ops[0].label, '24 Oct 2026, 00:30', device.ops[0].error!, device.ops[0].serverState!, 'Attachment references']) expect(html).toContain(value);
    expect(html).toContain('Discard mine'); expect(html).toContain('Retry');
    for (const token of ['requeue(owner, o.id)', 'await abandon(owner, o.id)', 'removeOp(owner, o.id)', 'clearSynced(owner)']) expect(source('field-capture')).toContain(token);
    expect(source('field-capture')).not.toContain('o.id.slice');
    expect(source('field-capture')).not.toContain('opacity-55');
  });

  it('preserves native pending/error/duplicate protections for all delivery action dialogs', () => {
    for (const file of ['schedule-workspace', 'site-workspace', 'projects-workspace', 'timesheets-workspace']) for (const token of ['ConstructionDialog', 'useConstructionSave', 'pending={pending}', 'role="alert"']) expect(source(file)).toContain(token);
    for (const file of ['schedule-workspace', 'site-workspace', 'workforce-workspace', 'timesheets-workspace']) { expect(source(file)).toContain('useConstructionReview'); expect(source(file)).toContain('{confirmation}'); }
  });

  it('runs no record action, offline capture or queue mutation during read-only QA', () => {
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
    for (const action of [device.capture, device.removeOp, device.clearSynced, device.abandon, device.requeue, device.setForcedOffline]) expect(action).not.toHaveBeenCalled();
  });
});
