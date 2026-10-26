'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleCheck, Clock, Pause, Play, RotateCcw, Wrench } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { FacilityDialog, FacilityFeedback, FacilityKpi } from './facility-ui';
import { type Tone } from '@/lib/status-tones';
import { fireWoTransition } from '@/server/actions/work-orders';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-specialists.module.css';

export type Job = { ref: string; title: string; priority: string; status: string; origin: string; dueISO: string | null; location: string; assetName?: string };
const PRIORITY_TONE: Record<string, Tone> = { emergency: 'danger', high: 'warn', routine: 'info' };
const STATUS_TONE: Record<string, Tone> = { assigned: 'info', in_progress: 'progress', on_hold: 'warn', resolved: 'success', verified: 'success', closed: 'muted' };
const ORIGIN_LABEL: Record<string, string> = { resident_request: 'Resident request', manager: 'Manager', ppm_schedule: 'PPM schedule', failed_inspection: 'Failed inspection', sensor_alarm: 'Sensor alarm' };
const NEXT: Record<string, { event: string; label: string; icon: React.ReactNode; primary?: boolean }[]> = {
  assigned: [{ event: 'START', label: 'Start job', icon: <Play size={16} />, primary: true }],
  in_progress: [{ event: 'RESOLVE', label: 'Mark resolved', icon: <Check size={16} />, primary: true }, { event: 'HOLD', label: 'Hold', icon: <Pause size={16} /> }],
  on_hold: [{ event: 'RESUME', label: 'Resume', icon: <RotateCcw size={16} />, primary: true }, { event: 'RESOLVE', label: 'Resolve', icon: <Check size={16} /> }],
};
const date = (iso: string) => new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });

function countdown(iso: string | null, nowMs: number): { text: string; tone: Tone } {
  if (!iso) return { text: 'No SLA recorded', tone: 'muted' };
  const difference = Date.parse(iso) - nowMs;
  const absolute = Math.abs(difference);
  const hours = Math.floor(absolute / 3600000), minutes = Math.floor(absolute % 3600000 / 60000);
  const label = hours >= 24 ? Math.floor(hours / 24) + 'd ' + hours % 24 + 'h' : hours >= 1 ? hours + 'h ' + minutes + 'm' : minutes + 'm';
  return difference < 0 ? { text: label + ' overdue', tone: 'danger' } : { text: label + ' left', tone: difference < 4 * 3600000 ? 'warn' : 'success' };
}

export function TechnicianWorkspace({ jobs, techName, nowMs, canTransition = false }: { jobs: Job[]; techName: string; nowMs: number; canTransition?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<{ ref: string; event: string; label: string } | null>(null);
  const [jobNote, setJobNote] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const onNow = jobs.filter((job) => job.status === 'in_progress');
  const upNext = jobs.filter((job) => job.status === 'assigned');
  const waiting = jobs.filter((job) => job.status === 'on_hold');
  const done = jobs.filter((job) => ['resolved', 'verified', 'closed'].includes(job.status));
  const active = [...onNow, ...upNext, ...waiting];
  const nextDue = active.map((job) => job.dueISO).filter((value): value is string => value !== null).sort()[0] ?? null;

  function fire(ref: string, event: string, label: string, note?: string) {
    if (!canTransition || pending || inFlight.current) return;
    if (['HOLD', 'RESOLVE'].includes(event) && (!review || review.ref !== ref || review.event !== event)) { setFeedback(null); setJobNote(''); setReview({ ref, event, label }); return; }
    if (['HOLD', 'RESOLVE'].includes(event) && (!note || note.trim().length < 3)) { setFeedback(event === 'HOLD' ? 'Record the blocker before putting the job on hold.' : 'Record a completion note before resolving the job.'); return; }
    inFlight.current = true;
    setBusy(ref);
    setFeedback(null);
    start(async () => {
      try {
        const result = await fireWoTransition(ref, event, { note: note?.trim() });
        if (!result.ok) { setFeedback(result.error); return; }
        setReview(null);
        router.refresh();
        setFeedback(ref + ' · ' + label + ' recorded.');
      } catch { setFeedback('The job update could not be confirmed. Refresh before retrying.'); }
      finally { inFlight.current = false; setBusy(null); }
    });
  }
  const card = (job: Job) => <JobCard key={job.ref} job={job} nowMs={nowMs} busy={busy === job.ref || pending} onFire={fire} canTransition={canTransition} />;

  return <div className={styles.stack}>
    <Card className={styles.panel}><CardHeader title={'Good day, ' + techName} subtitle={'Recorded work queue · ' + date(new Date(nowMs).toISOString()) + ' WAT'} action={<StatusPill status={active.length + ' open job(s)'} tone={active.length ? 'progress' : 'muted'} />} /><div className={styles.toolbar}><div className={styles.rowContent}><h2 className={styles.title}>Focus on the next safe action</h2><p className={styles.body}>Open the job details, check the location and record progress when the work changes.</p><p className={styles.metadata}>SLA timing is calculated at the snapshot time. Completed records are not restricted to today.</p></div>{nextDue ? <StatusPill status={'Next SLA · ' + countdown(nextDue, nowMs).text} tone={countdown(nextDue, nowMs).tone} /> : null}</div></Card>
    <div className={layout.metrics}><FacilityKpi label="On now" value={String(onNow.length)} tone="progress" icon={<Wrench size={18} />} /><FacilityKpi label="Up next" value={String(upNext.length)} tone="info" icon={<Play size={18} />} /><FacilityKpi label="Waiting" value={String(waiting.length)} tone="warn" icon={<Pause size={18} />} /><FacilityKpi label="Completed records" value={String(done.length)} sub="Resolved, verified or closed" tone="success" icon={<CircleCheck size={18} />} /></div>

    <PageTabs label="My day job sections" defaultTab={onNow.length ? 'now' : 'next'} items={[
      { id: 'now', label: 'On now', count: onNow.length, content: <JobSection title="In progress" subtitle="Work currently marked in progress" jobs={onNow} renderJob={card} emptyTitle="No jobs in progress." emptyDescription="Started jobs will appear here with their recorded location, priority and SLA." /> },
      { id: 'next', label: 'Up next', count: upNext.length, content: <JobSection title="Assigned to you" subtitle="Review the work and site conditions before starting" jobs={upNext} renderJob={card} emptyTitle="No assigned jobs waiting to start." emptyDescription="There are no assigned jobs in your current work queue." /> },
      { id: 'waiting', label: 'On hold', count: waiting.length, content: <JobSection title="Waiting / on hold" subtitle="Check the blocker before resuming work" jobs={waiting} renderJob={card} emptyTitle="No jobs on hold." emptyDescription="Paused jobs will appear here until the blocker is cleared." /> },
      { id: 'done', label: 'Completed', count: done.length, content: <JobSection title="Completed records" subtitle="All resolved, verified and closed jobs in this scope · not limited to today" jobs={done} renderJob={card} emptyTitle="No completed jobs in this view." emptyDescription="Resolved, verified and closed records will appear here without losing their job details." /> },
    ]} />

    {review ? <FacilityDialog title={review.event === 'HOLD' ? 'Record job blocker' : 'Confirm job resolution'} pending={pending} onClose={() => setReview(null)}><div className={styles.stack}><p className={styles.title}>{review.ref}</p><p className={styles.body}>{review.event === 'HOLD' ? 'Describe what is blocking safe completion so the manager can act without calling for context.' : 'Summarise the work completed. This marks the job resolved; manager verification and closure remain separate authorised steps.'}</p><label className={layout.field}><span className={layout.label}>{review.event === 'HOLD' ? 'Blocker note' : 'Completion note'}</span><textarea value={jobNote} onChange={(event) => setJobNote(event.target.value)} required minLength={3} maxLength={1000} rows={4} className={layout.control} placeholder={review.event === 'HOLD' ? 'e.g. Replacement contactor unavailable on site' : 'e.g. Replaced contactor, tested load and restored service'} /></label><p className={styles.metadata}>The note is attributed to your account and stored in the work-order activity history.</p>{feedback ? <p role="alert" className="text-[14px] text-negative">{feedback}</p> : null}<div className={styles.actions}><Button disabled={pending} onClick={() => setReview(null)}>Go back</Button><Button variant="primary" disabled={pending || jobNote.trim().length < 3} onClick={() => fire(review.ref, review.event, review.label, jobNote)}>{pending ? 'Saving…' : review.event === 'HOLD' ? 'Put job on hold' : 'Confirm resolution'}</Button></div></div></FacilityDialog> : feedback ? <FacilityFeedback message={feedback} onDismiss={() => setFeedback(null)} /> : null}
  </div>;
}

function JobCard({ job, nowMs, busy, onFire, canTransition }: { job: Job; nowMs: number; busy: boolean; canTransition: boolean; onFire: (ref: string, event: string, label: string) => void }) {
  const complete = ['resolved', 'verified', 'closed'].includes(job.status);
  const sla = countdown(job.dueISO, nowMs);
  const actions = canTransition ? NEXT[job.status] ?? [] : [];
  return <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title={job.title} subtitle={job.ref + ' · ' + (ORIGIN_LABEL[job.origin] ?? job.origin)} action={<StatusPill status={job.priority} tone={PRIORITY_TONE[job.priority] ?? 'neutral'} />} /></div><div className={styles.panelBody}><div className={styles.stack}><div className={styles.toolbar}><StatusPill status={job.status.replaceAll('_', ' ')} tone={STATUS_TONE[job.status] ?? 'neutral'} />{!complete ? <StatusPill status={sla.text} tone={sla.tone} /> : null}</div><dl className={styles.facts}><div><dt>Location</dt><dd>{job.location || 'Not recorded'}</dd></div><div><dt>Asset</dt><dd>{job.assetName || 'No asset linked'}</dd></div><div><dt>SLA due · WAT</dt><dd>{job.dueISO ? date(job.dueISO) : 'No SLA recorded'}</dd></div><div><dt>Origin</dt><dd>{ORIGIN_LABEL[job.origin] ?? job.origin}</dd></div></dl></div></div>{actions.length ? <div className={styles.footer}><div className={styles.actions}>{actions.map((action) => <Button key={action.event} variant={action.primary ? 'primary' : 'secondary'} disabled={busy} icon={action.icon} aria-label={action.label + ' ' + job.ref} onClick={() => onFire(job.ref, action.event, action.label)}>{action.label}</Button>)}</div></div> : <p className={styles.footer}>{complete ? 'Resolution, verification and closure are separate recorded workflow states.' : 'Read-only queue. Work progress can only be changed by an authorised role.'}</p>}</Card>;
}

function JobSection({ title, subtitle, jobs, renderJob, emptyTitle, emptyDescription }: { title: string; subtitle: string; jobs: Job[]; renderJob: (job: Job) => React.ReactNode; emptyTitle: string; emptyDescription: string }) {
  return <section className={styles.stack} aria-label={title}><div><h2 className={styles.title}>{title}</h2><p className={styles.metadata}>{subtitle}</p></div>{jobs.length ? <div className={styles.recordGrid}>{jobs.map(renderJob)}</div> : <Card><EmptyState icon={<Clock size={26} />} title={emptyTitle} description={emptyDescription} /></Card>}</section>;
}
