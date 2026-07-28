'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Timer, Wallet, TrendingUp, MapPin, CheckCircle2 } from 'lucide-react';
import { formatMoney, DomainStatus } from '@/components/domain';
import { toneVar, type Tone } from '@/lib/status-tones';
import type { WorkOrderStatus } from '@/domain/enums';
import { slaState } from '@/domain/work-orders';
import { jobEarnings } from '@/domain/vendor-portal';
import { fireWoTransition } from '@/server/actions/work-orders';

export type JobAction = { event: string; label: string; variant: 'primary' | 'default' | 'danger' };
export type JobView = { id: string; ref: string; title: string; status: WorkOrderStatus; costMinor: number | null; respondDueAt: string | null; resolveDueAt: string | null; requesterName: string; unitLabel: string; actions: JobAction[] };

const money = (m: number) => formatMoney({ minor: m, currency: 'NGN' } as Parameters<typeof formatMoney>[0]);
const OPEN = ['assigned', 'in_progress', 'on_hold'];
const DONE = ['resolved', 'verified', 'closed'];

function fmtRemaining(ms: number): string {
  const past = ms < 0, a = Math.abs(ms);
  const h = Math.floor(a / 3_600_000), m = Math.floor((a % 3_600_000) / 60_000), s = Math.floor((a % 60_000) / 1000);
  const core = h >= 1 ? `${h}h ${m}m` : m >= 1 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  return past ? `${core} over` : core;
}

export function VendorJobsWorkspace({ jobs, nowMs }: { jobs: JobView[]; nowMs: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState(nowMs);
  const [tab, setTab] = useState<'todo' | 'active' | 'done'>('todo');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (!jobs.some((j) => OPEN.includes(j.status))) return;
    const t = setInterval(() => setNow((n) => n + 1000), 1000);
    return () => clearInterval(t);
  }, [jobs]);

  const fire = (ref: string, event: string, label: string) => start(async () => {
    const r = await fireWoTransition(ref, event);
    if (r.ok) { router.refresh(); flash(`${label} — ${ref} updated.`); } else flash(r.error);
  });

  const earn = jobEarnings(jobs.map((j) => ({ status: j.status, costMinor: j.costMinor })));
  const dueSoon = jobs.filter((j) => OPEN.includes(j.status)).map((j) => slaState(j, now)).filter((s) => s.state !== 'ok' && s.state !== 'none').length;
  const todo = jobs.filter((j) => j.status === 'assigned');
  const active = jobs.filter((j) => ['in_progress', 'on_hold'].includes(j.status));
  const done = jobs.filter((j) => DONE.includes(j.status));
  const shown = tab === 'todo' ? todo : tab === 'active' ? active : done;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-2.5">
        <Kpi label="To do" value={String(todo.length)} note="awaiting start" tone={todo.length ? 'warn' : 'success'} icon={<Briefcase size={17} />} />
        <Kpi label="Due soon" value={String(dueSoon)} note="live SLA" tone={dueSoon ? 'danger' : 'success'} icon={<Timer size={17} />} />
        <Kpi label="Earned" value={money(earn.earnedMinor)} note={`${earn.doneJobs} completed`} tone="success" icon={<Wallet size={17} />} />
        <Kpi label="Pipeline" value={money(earn.pipelineMinor)} note={`${earn.activeJobs} in hand`} tone="progress" icon={<TrendingUp size={17} />} />
      </div>

      <div className="flex gap-1.5">
        {([['todo', 'To do', todo.length], ['active', 'In progress', active.length], ['done', 'Done', done.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium border ${tab === k ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{label} · {n}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-2xl">
          <CheckCircle2 size={24} className="mx-auto text-text-3 mb-2" />
          <p className="text-[13px] font-medium">Nothing here</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((j) => {
            const sla = slaState(j, now);
            return (
              <div key={j.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{j.title}</div>
                    <div className="text-[11.5px] text-text-3 flex items-center gap-1 flex-wrap"><span className="font-mono">{j.ref}</span><MapPin size={11} /> {j.unitLabel} · {j.requesterName}</div>
                  </div>
                  <div className="text-right flex-none">
                    <DomainStatus type="work_order" status={j.status} />
                    {j.costMinor ? <div className="text-[12px] font-mono font-semibold mt-1">{money(j.costMinor)}</div> : null}
                  </div>
                </div>

                {sla.state !== 'none' && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: toneVar(sla.tone) }}>
                    <Timer size={12} />
                    <span className="font-mono font-semibold tabular-nums">{sla.msRemaining === null ? '—' : fmtRemaining(sla.msRemaining)}</span>
                    <span className="text-text-3">{sla.kind === 'respond' ? 'to respond' : 'to resolve'}</span>
                  </div>
                )}

                {j.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {j.actions.map((a) => (
                      <button key={a.event} disabled={pending} onClick={() => fire(j.ref, a.event, a.label)} className={`text-[12px] px-3 h-8 rounded-lg font-medium disabled:opacity-50 ${a.variant === 'danger' ? 'text-negative border border-[color:var(--tone-danger)]/40' : a.variant === 'primary' ? 'bg-primary text-white' : 'border border-border-2 text-text-2'}`}>{a.label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div>
      <div className="text-[18px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[10.5px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
