'use client';

import { useConstructionSave, useConstructionReview, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, ConstructionDialog, ConstructionFrame, ConstructionEmpty } from './construction-ui';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './construction-delivery-polish.module.css';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Check, Undo2, Send, TriangleAlert, BookOpen } from 'lucide-react';
import { humanizeStatus, toneVar, type Tone } from '@/lib/status-tones';
import { submitReport, reviewReport, approveDailyReport, returnDailyReport } from '@/server/actions/construction';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';

export type ReportRow = {
  id: string; projectName: string; dateISO: string; weather: string; shift: string; officer: string;
  workforceCount: number; completed: string[]; ongoing: string[]; delayed: string[]; plannedNext: string[];
  deliveries: string[]; incidents: string[]; constraints: string[]; photos: number; status: string;
  band: Tone; completenessPct: number; missing: string[]; attendanceCount: number; inconsistent: boolean;
};
export type SiteIssueRow = {
  id: string; projectName: string; category: string; title: string; severity: string;
  owner: string; raisedISO: string; dueISO: string; status: string; correctiveAction?: string;
};

const NEXT: Record<string, string> = { draft: 'Submit', returned: 'Resubmit', submitted: 'Review', reviewed: 'Approve' };
const ISSUE_TONE: Record<string, Tone> = { low: 'info', medium: 'warn', high: 'danger', critical: 'danger' };
const ISSUE_STATUS_TONE: Record<string, Tone> = { open: 'warn', in_progress: 'progress', resolved: 'success' };
const displayDate = (value: string) => new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
const hasRecordedDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function SiteWorkspace({ reports, issues = [], gaps, kpis, canMutate }: {
  reports: ReportRow[]; issues?: SiteIssueRow[]; gaps: string[];
  kpis: { approved: number; pending: number; coverage: number; incidents: number };
  canMutate: boolean;
}) {
  const router = useRouter();

  const [returnFor, setReturnFor] = useState<ReportRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);

  const advance = (r: ReportRow) => {
    const detail = `${r.projectName} · ${r.dateISO} · ${r.officer}. Review completed work, incidents, missing fields and attendance discrepancies before advancing this report.`;
    if (r.status === 'draft' || r.status === 'returned') return act(() => submitReport(r.id), `Submit ${r.projectName} report`, detail);
    if (r.status === 'submitted') return act(() => reviewReport(r.id), `Review ${r.projectName} report`, detail);
    return act(() => approveDailyReport(r.id), `Approve ${r.projectName} report`, `${detail} Approval includes this report in the site diary and digest.`);
  };

  const diary = reports.filter((r) => r.status === 'approved').sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO));

  return (
    <ConstructionFrame>
      <PageHeader title="Site log" subtitle="Review daily reports and keep an approved record of work on site." />
      {gaps.length > 0 && (
        <Card className={styles.section}><CardHeader title="Reporting gaps" subtitle={`${gaps.length} missing approved report reference(s) · all gaps shown`} action={<TriangleAlert size={20} className="text-warning" />} /><p className={styles.text}>No approved report is recorded for the references below. The digest must disclose the gap rather than invent progress.</p><ul className={styles.list}>{gaps.map((gap, index) => <li key={`${index}-${gap}`}>{/^\d{4}-\d{2}-\d{2}$/.test(gap) ? <time dateTime={gap}>{displayDate(gap)} · WAT</time> : gap}</li>)}</ul></Card>
      )}

      <PageTabs label="Construction site sections" items={[
        {
          id: 'reports', label: 'Daily reports', content: <div className={styles.stack}>
            <div className={styles.stack}>
              {reports.map((r) => (
                <ConstructionPanel key={r.id}>
                  <div className={styles.header}><CardHeader title={r.projectName} subtitle={`${displayDate(r.dateISO)} · WAT · ${r.officer}`} action={<div className={styles.inline}><StatusPill status={humanizeStatus(r.status)} tone={r.band} /><CompletenessRing pct={r.completenessPct} /></div>} /></div>
                  <div className={`${styles.body} ${styles.stack}`}>
                  <dl className={`${styles.facts} ${styles.factsFour}`}><div><dt>Weather recorded</dt><dd>{r.weather || 'Not recorded'}</dd></div><div><dt>Workforce on site</dt><dd>{r.workforceCount}</dd></div><div><dt>Shift</dt><dd>{humanizeStatus(r.shift)}</dd></div><div><dt>Photo references recorded</dt><dd>{r.photos}</dd></div></dl>

                  {r.inconsistent && (
                    <div className={styles.notice}>
                      <TriangleAlert size={18} /> Workforce count ({r.workforceCount}) differs by more than 15% from recorded attendance ({r.attendanceCount}) — confirm the source records before approving.
                    </div>
                  )}
                  {r.missing.length > 0 && <p className={styles.text}>Missing: {r.missing.join(', ')}</p>}

                  <div className={styles.twoColumns}>
                    <Field label="Completed" items={r.completed} tone="success" />
                    <Field label="Ongoing" items={r.ongoing} tone="progress" />
                    <Field label="Delayed" items={r.delayed} tone="danger" />
                    <Field label="Planned next" items={r.plannedNext} tone="info" />
                    {r.deliveries.length > 0 && <Field label="Deliveries" items={r.deliveries} tone="info" />}
                    {r.incidents.length > 0 && <Field label="Incidents" items={r.incidents} tone="warn" />}
                    {r.constraints.length > 0 && <Field label="Constraints" items={r.constraints} tone="warn" />}
                  </div>

                  {canMutate && r.status !== 'approved' && (
                    <div className={`${styles.actions} ${styles.footer}`}>
                      <Button variant="primary" type="button" disabled={pending} onClick={() => advance(r)} ><Check size={12} /> {NEXT[r.status] ?? 'Advance'}</Button>
                      {(r.status === 'submitted' || r.status === 'reviewed') && <Button type="button" disabled={pending} onClick={() => setReturnFor(r)} ><Undo2 size={12} /> Return</Button>}
                    </div>
                  )}
                  </div>
                </ConstructionPanel>
              ))}
              {reports.length === 0 && <ConstructionEmpty title="No daily reports" />}
            </div>
          </div>
        },
        {
          id: 'issues', label: 'Site issues', count: issues.length, content: <div className={styles.stack}>
            <ConstructionPanel><div className={styles.header}><CardHeader title="Site issue register" subtitle="Captured and escalated issues in your authorised projects" /></div><div className={styles.body}><p className={styles.notice}>This register is read-only. Review the owner and proposed corrective action; status changes are not available in this view.</p></div></ConstructionPanel>
            {issues.map((issue) => <ConstructionPanel key={issue.id}><div className={styles.header}><CardHeader title={issue.title} subtitle={`${issue.projectName} · ${issue.category || 'Uncategorised'}`} action={<div className={styles.inline}><StatusPill status={humanizeStatus(issue.severity)} tone={ISSUE_TONE[issue.severity] ?? 'muted'} /><StatusPill status={humanizeStatus(issue.status)} tone={ISSUE_STATUS_TONE[issue.status] ?? 'muted'} /></div>} /></div><div className={`${styles.body} ${styles.stack}`}><dl className={`${styles.facts} ${styles.factsFour}`}><div><dt>Issue reference</dt><dd>{issue.id}</dd></div><div><dt>Recorded owner</dt><dd>{issue.owner || 'Not assigned'}</dd></div><div><dt>Raised · WAT</dt><dd><time dateTime={issue.raisedISO}>{displayDate(issue.raisedISO)}</time></dd></div><div><dt>Due · WAT</dt><dd>{hasRecordedDate(issue.dueISO) ? <time dateTime={issue.dueISO}>{displayDate(issue.dueISO)}</time> : 'Not recorded'}</dd></div></dl><section className={styles.fieldSection}><h3 className={styles.title}>Proposed corrective action</h3><p className={styles.text}>{issue.correctiveAction || 'No corrective action recorded.'}</p></section></div></ConstructionPanel>)}
            {issues.length === 0 && <ConstructionEmpty title="No site issues recorded" description="Synced field captures and escalated risk issues will appear here when recorded in your authorised projects." />}
          </div>
        },
        {
          id: 'diary', label: 'Approved diary', content: <div className={styles.stack}>
            <ConstructionPanel >
              <div className={styles.header}><CardHeader title="Site diary" subtitle="Approved records only · newest report first" /></div>
              <div>
                {diary.map((r) => (
                  <div key={r.id} className={`${styles.row} ${styles.stack}`}>
                    <CardHeader title={r.projectName} subtitle={`${displayDate(r.dateISO)} · WAT · ${r.officer} · ${r.shift} shift`} action={<StatusPill status="Approved record" tone="success" />} />
                    <div className={styles.twoColumns}><Field label="Completed" items={r.completed} tone="success" /><Field label="Ongoing" items={r.ongoing} tone="progress" /><Field label="Delayed" items={r.delayed} tone="danger" /><Field label="Planned next" items={r.plannedNext} tone="info" /><Field label="Deliveries" items={r.deliveries} tone="info" /><Field label="Incidents" items={r.incidents} tone="warn" /><Field label="Constraints" items={r.constraints} tone="warn" /></div>
                  </div>
                ))}
                {diary.length === 0 && <EmptyState title="No approved diary records" description="The diary stays empty until a report is signed off." />}
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'overview', label: 'Overview', content: <div className="pb-section">
            <div className={styles.metrics}>
              <Kpi label="Approved reports" value={String(kpis.approved)} tone="success" icon={<ClipboardCheck size={16} />} />
              <Kpi label="Awaiting action" value={String(kpis.pending)} tone={kpis.pending ? 'warn' : 'success'} icon={<Send size={16} />} />
              <Kpi label="7-day coverage" value={`${kpis.coverage}%`} tone={kpis.coverage >= 85 ? 'success' : 'warn'} icon={<BookOpen size={16} />} />
              <Kpi label="Incidents logged" value={String(kpis.incidents)} tone={kpis.incidents ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
            </div>
          </div>
        }
      ]} />

      {/* Reports */}

      {/* Site diary */}

      {returnFor && <ReturnDialog report={returnFor} onClose={() => setReturnFor(null)} onDone={() => { setReturnFor(null); flash('Returned to the site engineer'); }} />}
      {confirmation}
      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </ConstructionFrame>
  );
}

function ReturnDialog({ report, onClose, onDone }: { report: ReportRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  function submit() { setError(null); start(async () => { const r = await returnDailyReport(report.id, reason); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <ConstructionDialog title={"Return report"} onClose={onClose} pending={pending}>
      <div className={styles.stack}><Card><CardHeader title={report.projectName} subtitle={`${displayDate(report.dateISO)} · WAT · ${report.officer}`} /></Card>
      <label className={styles.field}>Reason (required)<textarea aria-label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs correcting?" autoFocus /></label>
      <p className={styles.text}>The reason is attached to the record and the report drops back to draft. Review the correction request before confirming.</p>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose} >Cancel</Button><Button variant="primary" type="button" onClick={submit} disabled={pending || !reason.trim()} >{pending ? 'Returning…' : 'Return'}</Button></div></div>
    </ConstructionDialog>
  );
}
function Field({ label, items, tone }: { label: string; items: string[]; tone: Tone }) {
  return (
    <section className={styles.fieldSection}><div className={styles.inline}><h3 className={styles.title}>{label}</h3><StatusPill status={`${items.length} recorded`} tone={tone} /></div>{items.length ? <ul className={styles.list}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul> : <p className={styles.metadata}>No entries recorded.</p>}</section>
  );
}
function CompletenessRing({ pct }: { pct: number }) {
  const band: Tone = pct >= 90 ? 'success' : pct >= 60 ? 'warn' : 'danger';
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 52, height: 52 }} role="img" aria-label={`${pct}% report-field completeness, not evidence verification`}>
      <svg width={52} height={52} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className="text-[12px] font-bold" style={{ color }}>{pct}%</span></div>
    </div>
  );
}
