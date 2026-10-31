'use client';

import { useConstructionSave, useConstructionReview, ConstructionSummary, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, ConstructionDialog, ConstructionFrame, ConstructionEmpty } from './construction-ui';
import { Card, CardHeader, IconButton, Button, StatusPill, EmptyState } from '@/components/ui';
import styles from './construction-delivery-polish.module.css';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Zap, Flag, TriangleAlert, ChevronRight, Check } from 'lucide-react';
import { humanizeStatus, toneVar, type Tone } from '@/lib/status-tones';
import { updateTaskProgress, advanceMilestone, escalateTaskToIssue } from '@/server/actions/construction';
import { PageTabs } from '@/components/ui/page-tabs';

export type GanttTask = {
  id: string; name: string; owner: string; phase: string;
  plannedStartISO: string; plannedFinishISO: string; actualStartISO?: string;
  percentComplete: number; status: string; critical: boolean; slackDays: number;
  offsetDays: number; durationDays: number; downstream: string[];
};
export type MilestoneRow = { id: string; name: string; dueISO: string; status: string; band: Tone };

const STATUS_TONE: Record<string, Tone> = { not_started: 'muted', in_progress: 'progress', blocked: 'danger', done: 'success' };
const displayDate = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : 'Not recorded';

export function ScheduleWorkspace({ projectName, tasks, milestones, kpis, canMutate, canCreate = false }: {
  projectName: string;
  tasks: GanttTask[]; milestones: MilestoneRow[];
  kpis: { durationDays: number; criticalCount: number; blocked: number; forecastFinishISO: string; slipDays: number; plannedFinishISO: string; approvedChangeDays?: number; changeDaysInBaseline?: number };
  canMutate: boolean;
  canCreate?: boolean;
}) {
  const router = useRouter();

  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<GanttTask | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);

  const span = Math.max(1, ...tasks.map((t) => t.offsetDays + t.durationDays));
  const hasForecast = Number.isFinite(Date.parse(kpis.forecastFinishISO)) && Number.isFinite(Date.parse(kpis.plannedFinishISO));
  // Everything downstream of the hovered task — the "what slips if this slips" cascade.
  const cascade = hover ? new Set(tasks.find((t) => t.id === hover)?.downstream ?? []) : new Set<string>();

  return (
    <ConstructionFrame>
      <ConstructionSummary>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="construction-summary-icon" ><CalendarClock size={22} /></span>
          <div className="min-w-0">
            <div className="text-[14px] text-text-3">CRITICAL PATH · {projectName.toUpperCase()}</div>
            <h2 className="text-[21px] font-medium tracking-[-0.02em] leading-tight mt-0.5">{kpis.criticalCount} tasks on the critical chain</h2>
            <div className="text-[14px] text-text-3 mt-0.5">
              {hasForecast ? <>{kpis.durationDays}-day network · estimated finish <span className="font-medium" style={{ color: toneVar(kpis.slipDays > 0 ? 'danger' : 'success') }}>{displayDate(kpis.forecastFinishISO)}</span>{kpis.slipDays > 0 ? ` · ${kpis.slipDays}d later than plan` : ' · on plan'}</> : 'Add a project and schedule to calculate a finish forecast.'}
            </div>
            {hasForecast && (kpis.approvedChangeDays ?? 0) > 0 ? <p className="text-[13px] text-text-3 mt-1">Approved baseline {displayDate(kpis.plannedFinishISO)} · {kpis.changeDaysInBaseline ?? 0} approved working days included · {Math.max(0, (kpis.approvedChangeDays ?? 0) - (kpis.changeDaysInBaseline ?? 0))} approved working days in the current forecast</p> : null}
          </div>
        </div>
      </ConstructionSummary>

      <PageTabs label="Construction schedule sections" items={[
        {
          id: 'network', label: 'Task network', content: <div className={styles.stack}>
            <ConstructionPanel >
              <div className={styles.header}><CardHeader title="Schedule network" subtitle="Hover or keyboard-focus a task to inspect its downstream dependencies. Dates are WAT operating days." action={<div className={styles.inline}><StatusPill status="Critical path" tone="danger" /><StatusPill status="Available float" tone="progress" /></div>} /></div>
              <div className={styles.scroll} role="region" aria-label="Construction task network, horizontally scrollable" tabIndex={0}><div className={styles.gantt}>
                {tasks.map((t) => {
                  const isCascade = cascade.has(t.id);
                  const bar = t.critical ? 'danger' : t.slackDays <= 3 ? 'warn' : 'progress';
                  return (
                    <div key={t.id} tabIndex={0} aria-label={`${t.name}: ${t.percentComplete}% complete, ${t.durationDays} days, ${t.critical ? 'critical path' : `${t.slackDays} days float`}`} onFocus={() => setHover(t.id)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}
                      className={styles.ganttRow}
                      style={isCascade ? { background: 'color-mix(in srgb, var(--tone-warn) 8%, transparent)' } : undefined}>
                      <div className={styles.ganttIdentity}>
                        <div className={styles.inline}>
                          {t.critical && <Zap size={16} style={{ color: toneVar('danger') }} className="flex-none" aria-label="Critical path" />}
                          <p className={styles.rowTitle}>{t.name}</p>
                          {isCascade && <StatusPill status="Downstream dependency" tone="warn" />}
                        </div>
                        <p className={styles.text}>{t.owner} · {t.phase}</p>
                        <p className={styles.metadata}>{displayDate(t.plannedStartISO)} → {displayDate(t.plannedFinishISO)} · {t.durationDays} days · {t.critical ? 'zero float' : `${t.slackDays} days float`}</p>
                        {t.actualStartISO && <p className={styles.metadata}>Recorded start: {displayDate(t.actualStartISO)}</p>}
                      </div>
                      <div className={styles.ganttControls}>
                        <div className={styles.ganttTrack} aria-hidden="true">
                          <div style={{ left: `${(t.offsetDays / span) * 100}%`, width: `${Math.max(1.5, (t.durationDays / span) * 100)}%`, background: toneVar(bar), opacity: .3 }} />
                          <div style={{ left: `${(t.offsetDays / span) * 100}%`, width: `${Math.max(0, (t.durationDays / span) * 100 * (t.percentComplete / 100))}%`, background: toneVar(bar) }} />
                        </div>
                        <span className={styles.ganttValue}>{t.percentComplete}%</span>
                        <StatusPill status={humanizeStatus(t.status)} tone={STATUS_TONE[t.status] ?? 'muted'} />
                        {canMutate && <IconButton aria-label={`Update progress for ${t.name}`} type="button" onClick={() => setEditing(t)} title="Update progress"><ChevronRight size={18} /></IconButton>}
                      </div>
                    </div>
                  );
                })}
                {tasks.length === 0 && <ConstructionEmpty title="No scheduled tasks" />}
              </div></div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'milestones', label: 'Milestones', content: <div className={styles.stack}>
            <ConstructionPanel >
              <div className={styles.header}><CardHeader title="Milestones" subtitle="Recorded due dates and operator-reviewed acceptance" /></div>
              <div>
                {milestones.map((m) => (
                  <div key={m.id} className={`${styles.row} ${styles.toolbar}`}>
                    <div><h3 className={styles.title}>{m.name}</h3><p className={styles.metadata}>Due {displayDate(m.dueISO)} · WAT</p></div>
                    <StatusPill status={humanizeStatus(m.status)} tone={m.band} />
                    {canMutate && m.status !== 'accepted' && <Button type="button" disabled={pending} onClick={() => act(() => advanceMilestone(m.id), 'Milestone accepted')} className="flex-none">Accept</Button>}
                  </div>
                ))}
                {milestones.length === 0 && <EmptyState title="No milestones" description="No milestone records are available in this project snapshot." />}
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'overview', label: 'Overview', content: <div className="pb-section">
            <div className={styles.metrics}>
              <Kpi label="Network duration" value={`${kpis.durationDays}d`} tone="info" icon={<CalendarClock size={16} />} />
              <Kpi label="On critical path" value={String(kpis.criticalCount)} tone="danger" icon={<Zap size={16} />} />
              <Kpi label="Blocked tasks" value={String(kpis.blocked)} tone={kpis.blocked ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
              <Kpi label="Forecast slip" value={!hasForecast ? '—' : kpis.slipDays > 0 ? `+${kpis.slipDays}d` : 'on plan'} tone={!hasForecast ? 'muted' : kpis.slipDays > 0 ? 'warn' : 'success'} icon={<Flag size={16} />} />
            </div>
          </div>
        }
      ]} />

      {/* Gantt */}

      {/* Milestones */}

      {editing && <ProgressDialog task={editing} canCreate={canCreate} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); flash(m); }} />}
      {confirmation}
      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </ConstructionFrame>
  );
}

function ProgressDialog({ task, canCreate, onClose, onDone }: { task: GanttTask; canCreate: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pct, setPct] = useState(String(task.percentComplete));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const [reviewEscalation, setReviewEscalation] = useState(false);
  function save() { setError(null); start(async () => { const r = await updateTaskProgress(task.id, Number(pct)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`${task.name} → ${pct}%`); }); }
  function escalate() { start(async () => { const r = await escalateTaskToIssue(task.id); if (r.ok) { router.refresh(); onDone('Escalated to a site issue'); } else setError(r.error); }); }
  return (
    <ConstructionDialog title={"Update progress"} onClose={onClose} pending={pending}>
      <div className={styles.stack}>
      <Card><CardHeader title={task.name} subtitle={`${task.owner} · ${task.critical ? 'on the critical path' : `${task.slackDays} days float`}`} /></Card>
      <label className={styles.field}>Percent complete<input aria-label="Percent complete" type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(e.target.value)} className={styles.range} aria-valuetext={`${pct}% complete`} /></label>
      <output className={styles.value}>{pct}%</output>
      {task.critical && <p className={styles.notice}>This task has zero float — every day it slips moves the calculated project finish. Confirm the recorded progress against site evidence.</p>}
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <div className={styles.toolbar}>
        {canCreate && <Button type="button" onClick={() => setReviewEscalation(true)} disabled={pending} >Review escalation</Button>}
        <div className={styles.actions}>
          <Button type="button" disabled={pending} onClick={onClose} >Cancel</Button>
          <Button variant="primary" type="button" onClick={save} disabled={pending} ><Check size={13} /> {pending ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      {reviewEscalation && <Card className={styles.section}><CardHeader title="Review site issue escalation" /><p className={styles.text}>Create a high-priority site issue for {task.name}? Confirm the recorded progress and owner before escalating. This is not an emergency dispatch.</p><Button type="button" variant="primary" onClick={escalate} disabled={pending}>Confirm create site issue</Button></Card>}
      </div>
    </ConstructionDialog>
  );
}
