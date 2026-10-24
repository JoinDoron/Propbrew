'use client';

import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles, ShortletMetric, ShortletFeedback , ShortletDialog , ShortletReview, ShortletConfirm } from './reference-ui';
import { Button, CardHeader, EmptyState, StatusPill, Card } from '@/components/ui';
import styles from './shortlet-operations-polish.module.css';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { suggestPriority, ISSUE_NEXT, type IssuePriority, type IssueStatus } from '@/domain/shortlet/operations';
import { logIssue, advanceIssue } from '@/server/actions/shortlet';

export type IssueRow = { id: string; apt: string; apartmentId: string; title: string; description: string; priority: IssuePriority; status: IssueStatus; createdAt: string; resolvedAt?: string };
export type Stats = { open: number; inProgress: number; resolvedThisMonth: number };

const PRIORITY_TONE: Record<IssuePriority, Tone> = { low: 'neutral', medium: 'info', high: 'warn', urgent: 'danger' };
const STATUS_TONE: Record<IssueStatus, Tone> = { open: 'warn', in_progress: 'progress', resolved: 'success' };
const STATUS_LABEL: Record<IssueStatus, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const fmtDate = (date: string) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(date.includes('T') ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Africa/Lagos' }).format(new Date(date));

export function MaintenanceWorkspace({ issues, apartments, stats , canCreate = false, canUpdate = false}: { issues: IssueRow[]; apartments: { id: string; name: string }[]; stats: Stats ; canCreate?: boolean; canUpdate?: boolean}) {
  const router = useRouter();
  const [tab, setTab] = useState<'all' | IssueStatus>('all');
  const [apt, setApt] = useState('all');
  const [logging, setLogging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (message: string) => setToast(message);

  const shown = issues.filter((i) => (tab === 'all' || i.status === tab) && (apt === 'all' || i.apartmentId === apt));

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      <div className={styles.toolbar}>
        <p className={styles.text}>{stats.open + stats.inProgress} active · {stats.resolvedThisMonth} resolved this month</p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setLogging(true)} disabled={!canCreate}>Log issue</Button>
      </div>

      <PageTabs label="Maintenance sections" items={[
        {
          id: "issues", label: "Issue register", content: <div className={styles.stack}>
            <Card className={styles.section}>
            <CardHeader title="Maintenance issues" subtitle="Recorded apartment issues, current priority and next status review" />
            <div className={styles.toolbar}>
              <div className={styles.filters} role="group" aria-label="Filter maintenance by status">
                {(['all', 'open', 'in_progress', 'resolved'] as const).map((t) => (
                  <Button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'all' ? 'All' : STATUS_LABEL[t]}</Button>
                ))}
              </div>
              <select value={apt} aria-label="Filter maintenance by apartment" onChange={(e) => setApt(e.target.value)} className={styles.control}><option value="all">All apartments</option>{apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </div>
            </Card>
            {shown.length === 0 ? (
              <Card><EmptyState title="No issues here" description="No maintenance records match the selected status and apartment." icon={<CheckCircle2 size={24} />} /></Card>
            ) : (
              <div className={styles.stack}>
                {shown.map((i) => {
                  const next = ISSUE_NEXT[i.status];
                  return (
                    <Card key={i.id} className={styles.section}>
                      <CardHeader title={i.title} subtitle={i.apt} action={<div className={styles.inline}><StatusPill status={humanizeStatus(i.priority)} tone={PRIORITY_TONE[i.priority]} /><StatusPill status={STATUS_LABEL[i.status]} tone={STATUS_TONE[i.status]} /></div>} />
                      <p className={styles.text}>{i.description || 'No description recorded.'}</p>
                      <dl className={styles.facts}><div><dt>Logged · WAT</dt><dd>{fmtDate(i.createdAt)}</dd></div><div><dt>Resolved · WAT</dt><dd>{i.resolvedAt ? fmtDate(i.resolvedAt) : 'Not resolved'}</dd></div></dl>
                      {next && <div className={styles.actions}><ShortletConfirm disabled={!canUpdate} title="Review maintenance status" label={next.label} description={`${i.title} · ${i.apt}. Move this issue from ${STATUS_LABEL[i.status]} to ${STATUS_LABEL[next.to]}.`} action={() => advanceIssue(i.id)} onDone={() => { router.refresh(); flash('Maintenance status recorded.'); }} /></div>}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        },
        {
          id: "summary", label: "Maintenance summary", content: <div className={styles.stack}>
            <div className={shortletStyles.columns}>
              <Kpi label="Open" value={String(stats.open)} note="awaiting action" tone={stats.open ? 'warn' : 'success'} icon={<AlertTriangle size={16} />} />
              <Kpi label="In progress" value={String(stats.inProgress)} note="being worked on" tone="progress" icon={<Clock size={16} />} />
              <Kpi label="Resolved" value={String(stats.resolvedThisMonth)} note="this month" tone="success" icon={<CheckCircle2 size={16} />} />
            </div>
          </div>
        }
      ]} />

      {logging && <LogDialog apartments={apartments} onClose={() => setLogging(false)} onDone={() => { setLogging(false); flash('Issue logged'); }} />}

      {toast && <ShortletFeedback message={toast} onClose={() => setToast(null)} />}

    </div>
  );
}

function LogDialog({ apartments, onClose, onDone }: { apartments: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(''); const [aptId, setAptId] = useState(apartments[0]?.id ?? '');
  const [priority, setPriority] = useState<IssuePriority>('medium'); const [touched, setTouched] = useState(false);
  const [desc, setDesc] = useState(''); const [error, setError] = useState<string | null>(null);
  const suggested = useMemo(() => (title.trim().length >= 3 ? suggestPriority(title) : null), [title]);
  const effective = touched ? priority : suggested ?? priority;

  function submit() { if (pending) return;  setError(null); start(async () => { try { const r = await logIssue({ apartmentId: aptId, title, description: desc, priority: effective }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone();  } catch { setError('Unable to save this record. Please try again.'); } }); }
  return (
    <ShortletDialog title="Log new issue" onClose={onClose} pending={pending} wide>
      <div className={styles.stack}>
        <Card className={styles.section}>
          <CardHeader title="Issue details" subtitle="Describe the apartment issue and review the proposed priority." />
          <label className={styles.field}>Title<input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AC not cooling in bedroom" className={styles.control} autoFocus /></label>
          <div className={styles.formGrid}>
            <label className={styles.field}>Apartment<select aria-label="Apartment" value={aptId} onChange={(e) => setAptId(e.target.value)} className={styles.control}>{apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className={styles.field}>Priority<select aria-label="Priority" value={effective} onChange={(e) => { setPriority(e.target.value as IssuePriority); setTouched(true); }} className={styles.control}>{(['low', 'medium', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          </div>
          {suggested && !touched && <p className={styles.notice}><Sparkles size={18} /><span>Suggested priority: <strong className="capitalize">{suggested}</strong> — rules-based title match; review before saving</span></p>}
          <label className={styles.field}>Description (optional)<textarea aria-label="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="When it started, what the guest said, any photos…" className={styles.control} /></label>
        </Card>
        {error && <div role="alert" className={styles.error}>{error}</div>}
        <div className={styles.reviewBoundary}><ShortletReview pending={pending} disabled={!title.trim()} onCancel={onClose} onSubmit={submit} label="Confirm log issue">Review the details above. This records a workspace change only; messages, bank transfers and gateway refunds are not sent by this form.</ShortletReview></div>
      </div>
    </ShortletDialog>
  );
}

function Kpi({ label, value, note, icon, tone }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) { return <ShortletMetric label={label} value={value} icon={icon} note={note} tone={tone} />; }
