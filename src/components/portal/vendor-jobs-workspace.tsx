'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Timer, Wallet, TrendingUp, MapPin, X } from 'lucide-react';
import { Button, CardHeader, EmptyState, IconButton } from '@/components/ui';
import { PortalCard, PortalKpi, portalMoney } from './portal-patterns';
import { PageTabs } from '@/components/ui/page-tabs';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import { DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import type { WorkOrderStatus } from '@/domain/enums';
import { slaState } from '@/domain/work-orders';
import { jobEarnings } from '@/domain/vendor-portal';
import { fireWoTransition } from '@/server/actions/work-orders';
import layout from '@/components/ui/workspace-layout.module.css';

export type JobAction = { event: string; label: string; variant: 'primary' | 'default' | 'danger' };
export type JobView = { id: string; ref: string; title: string; status: WorkOrderStatus; costMinor: number | null; costCurrency?: string | null; respondDueAt: string | null; resolveDueAt: string | null; requesterName: string; unitLabel: string; actions: JobAction[] };
const OPEN = ['assigned', 'in_progress', 'on_hold'];
const DONE = ['resolved', 'verified', 'closed'];
function fmtRemaining(milliseconds: number) { const past = milliseconds < 0; const amount = Math.abs(milliseconds); const hours = Math.floor(amount / 3600000); const minutes = Math.floor(amount % 3600000 / 60000); return `${hours ? `${hours}h ` : ''}${minutes}m ${past ? 'overdue at snapshot' : 'remaining at snapshot'}`; }

export function VendorJobsWorkspace({ jobs, nowMs, canTransition = false }: { jobs: JobView[]; nowMs: number; canTransition?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'todo' | 'active' | 'done'>('todo');
  const currencies = [...new Set(jobs.filter((job) => job.costMinor != null && job.costCurrency).map((job) => job.costCurrency!))].sort();
  const [currency, setCurrency] = useState(currencies.includes('NGN') ? 'NGN' : currencies[0] ?? 'NGN');
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const todo = jobs.filter((job) => job.status === 'assigned');
  const active = jobs.filter((job) => ['in_progress', 'on_hold'].includes(job.status));
  const done = jobs.filter((job) => DONE.includes(job.status));
  const shown = filter === 'todo' ? todo : filter === 'active' ? active : done;
  const earnings = jobEarnings(jobs.filter((job) => job.costCurrency === currency).map((job) => ({ status: job.status, costMinor: job.costMinor })));
  const dueSoon = jobs.filter((job) => OPEN.includes(job.status)).map((job) => slaState(job, nowMs)).filter((sla) => !['ok', 'none'].includes(sla.state)).length;
  function review(job: JobView, action: JobAction) {
    if (!canTransition) return;
    setDecision({ title: `Review ${action.label.toLowerCase()}`, record: `${job.ref} · ${job.title}`, description: `Change this work order from ${job.status.replaceAll('_', ' ')} using “${action.label}”. Completion is a workflow record; it does not verify a client sign-off, settle an invoice or release a vendor payout.`, confirmLabel: `Confirm ${action.label.toLowerCase()}`, action: () => fireWoTransition(job.ref, action.event), onSuccess: () => { router.refresh(); setMessage(`${job.ref} workflow updated. No payment was released.`); } });
  }
  return <div className={layout.layout}>
    <div className={layout.notice}><Timer size={18} /><p>Service target snapshot<span>{new Date(nowMs).toLocaleString('en-NG', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Lagos' })} WAT. Targets below are calculated at this recorded reference time, not a ticking live service clock.</span></p></div>
    <PageTabs label="Vendor job sections" items={[
      { id: 'jobs', label: 'My jobs', content: <div className={layout.layout}><div className={layout.filters}>{([['todo', 'To do', todo.length], ['active', 'In progress', active.length], ['done', 'Done', done.length]] as const).map(([key, label, count]) => <Button key={key} aria-pressed={filter === key} variant={filter === key ? 'primary' : 'secondary'} onClick={() => setFilter(key)}>{label} · {count}</Button>)}</div>{shown.length ? shown.map((job) => { const sla = slaState(job, nowMs); return <PortalCard key={job.id}><CardHeader title={job.title} subtitle={job.ref} action={<DomainStatus type="work_order" status={job.status} />} /><p className={`${layout.body} flex flex-wrap items-center gap-2`}><MapPin size={16} />{job.unitLabel} · {job.requesterName}</p><p className={`${layout.body} mt-4`}>{job.costMinor == null ? 'No work value recorded' : job.costCurrency ? `Recorded work value: ${portalMoney(job.costMinor, job.costCurrency)}` : 'Work value currency not recorded'}</p>{sla.state !== 'none' ? <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: toneVar(sla.tone) }}><Timer size={16} /><span>{sla.msRemaining == null ? 'No target recorded' : fmtRemaining(sla.msRemaining)}</span><span className={layout.metadata}>{sla.kind === 'respond' ? 'Response target' : 'Resolution target'}</span></div> : null}{job.actions.length ? <div className={`${layout.filters} mt-6`}>{job.actions.map((action) => <Button key={action.event} disabled={!canTransition} variant={action.variant === 'primary' ? 'primary' : 'secondary'} className={action.variant === 'danger' ? 'text-negative' : undefined} onClick={() => review(job, action)}>{action.label}</Button>)}</div> : null}</PortalCard>; }) : <PortalCard><EmptyState title="No jobs in this view" description="Assigned work appears in the appropriate workflow view." /></PortalCard>}</div> },
      { id: 'summary', label: 'Job summary', content: <div className={layout.layout}><div className={layout.toolbar}><p className={layout.body}>Work values are separated by currency. No FX conversion.</p><label className={layout.field}><span className={layout.label}>Summary currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className={layout.select}>{(currencies.length ? currencies : ['NGN']).map((value) => <option key={value}>{value}</option>)}</select></label></div><div className={layout.metrics}><PortalKpi label="To do" value={String(todo.length)} note="All scoped jobs" tone="info" icon={<Briefcase size={18} />} /><PortalKpi label="Due soon or overdue" value={String(dueSoon)} note="At the recorded snapshot" tone={dueSoon ? 'warn' : 'success'} icon={<Timer size={18} />} /><PortalKpi label={`Completed work value · ${currency}`} value={portalMoney(earnings.earnedMinor, currency)} note={`${earnings.doneJobs} completed records · not confirmed payouts`} tone="success" icon={<Wallet size={18} />} /><PortalKpi label={`Pipeline value · ${currency}`} value={portalMoney(earnings.pipelineMinor, currency)} note={`${earnings.activeJobs} active records · not earned cash`} tone="progress" icon={<TrendingUp size={18} />} /></div><p className={layout.metadata}>A completed or closed work order is not evidence of settlement. Records with no cost currency are excluded from monetary totals.</p></div> },
    ]} />
    {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    {message && <div className={layout.feedback} role="status"><span>{message}</span><IconButton aria-label="Dismiss job message" onClick={() => setMessage(null)}><X size={18} /></IconButton></div>}
  </div>;
}
