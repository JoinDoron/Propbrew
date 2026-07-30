'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Zap, Flag, TriangleAlert, ChevronRight, X, Check } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { updateTaskProgress, advanceMilestone, escalateTaskToIssue } from '@/server/actions/construction';

export type GanttTask = {
  id: string; name: string; owner: string; phase: string;
  plannedStartISO: string; plannedFinishISO: string; actualStartISO?: string;
  percentComplete: number; status: string; critical: boolean; slackDays: number;
  offsetDays: number; durationDays: number; downstream: string[];
};
export type MilestoneRow = { id: string; name: string; dueISO: string; status: string; band: Tone };

const STATUS_TONE: Record<string, Tone> = { not_started: 'muted', in_progress: 'progress', blocked: 'danger', done: 'success' };

export function ScheduleWorkspace({ projectName, tasks, milestones, kpis, canMutate }: {
  projectName: string;
  tasks: GanttTask[]; milestones: MilestoneRow[];
  kpis: { durationDays: number; criticalCount: number; blocked: number; forecastFinishISO: string; slipDays: number; plannedFinishISO: string };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<GanttTask | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const span = Math.max(1, ...tasks.map((t) => t.offsetDays + t.durationDays));
  // Everything downstream of the hovered task — the "what slips if this slips" cascade.
  const cascade = hover ? new Set(tasks.find((t) => t.id === hover)?.downstream ?? []) : new Set<string>();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0a1020 0%,#131f3a 55%,#1c2f57 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><CalendarClock size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">CRITICAL PATH · {projectName.toUpperCase()}</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{kpis.criticalCount} tasks on the critical chain</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">
              {kpis.durationDays}-day network · forecast finish <span className="font-semibold" style={{ color: toneVar(kpis.slipDays > 0 ? 'danger' : 'success') }}>{kpis.forecastFinishISO}</span>
              {kpis.slipDays > 0 ? ` · ${kpis.slipDays}d later than plan` : ' · on plan'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Network duration" value={`${kpis.durationDays}d`} tone="info" icon={<CalendarClock size={16} />} />
        <Kpi label="On critical path" value={String(kpis.criticalCount)} tone="danger" icon={<Zap size={16} />} />
        <Kpi label="Blocked tasks" value={String(kpis.blocked)} tone={kpis.blocked ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
        <Kpi label="Forecast slip" value={kpis.slipDays > 0 ? `+${kpis.slipDays}d` : 'on plan'} tone={kpis.slipDays > 0 ? 'warn' : 'success'} icon={<Flag size={16} />} />
      </div>

      {/* Gantt */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-semibold">Schedule network</span>
          <span className="text-[10.5px] text-text-3">· hover a bar to see what slips with it</span>
          <span className="ml-auto flex items-center gap-2.5 text-[10.5px] text-text-3">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: toneVar('danger') }} />critical</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: toneVar('progress') }} />float</span>
          </span>
        </div>
        <div className="divide-y divide-border">
          {tasks.map((t) => {
            const isCascade = cascade.has(t.id);
            const bar = t.critical ? 'danger' : t.slackDays <= 3 ? 'warn' : 'progress';
            return (
              <div key={t.id} onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}
                className="px-4 py-2.5 grid grid-cols-1 min-[720px]:grid-cols-[240px_1fr] gap-2 items-center transition-colors"
                style={isCascade ? { background: 'color-mix(in srgb, var(--tone-warn) 8%, transparent)' } : undefined}>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate flex items-center gap-1.5">
                    {t.critical && <Zap size={11} style={{ color: toneVar('danger') }} className="flex-none" />}
                    {t.name}
                    {isCascade && <span className="text-[9px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 16%, transparent)`, color: toneVar('warn') }}>slips too</span>}
                  </div>
                  <div className="text-[10.5px] text-text-3 truncate">{t.owner} · {t.phase} · {t.critical ? 'zero float' : `${t.slackDays}d float`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 h-6 rounded-lg bg-surface-2 overflow-hidden">
                    <div className="absolute top-0 bottom-0 rounded-lg opacity-30" style={{ left: `${(t.offsetDays / span) * 100}%`, width: `${Math.max(1.5, (t.durationDays / span) * 100)}%`, background: toneVar(bar) }} />
                    <div className="absolute top-0 bottom-0 rounded-lg" style={{ left: `${(t.offsetDays / span) * 100}%`, width: `${Math.max(0.6, (t.durationDays / span) * 100 * (t.percentComplete / 100))}%`, background: toneVar(bar) }} />
                  </div>
                  <span className="text-[10.5px] font-mono text-text-3 w-9 text-right flex-none">{t.percentComplete}%</span>
                  <span className="text-[9.5px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[t.status] ?? 'muted')} 14%, transparent)`, color: toneVar(STATUS_TONE[t.status] ?? 'muted') }}>{t.status.replace('_', ' ')}</span>
                  {canMutate && <button onClick={() => setEditing(t)} className="w-7 h-7 rounded-lg grid place-items-center border border-border-2 flex-none" title="Update progress"><ChevronRight size={13} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Milestones */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold flex items-center gap-2"><Flag size={14} className="text-text-3" /> Milestones</div>
        <div className="divide-y divide-border">
          {milestones.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: toneVar(m.band) }} />
              <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{m.name}</div><div className="text-[10.5px] text-text-3">due {m.dueISO}</div></div>
              <span className="text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(m.band)} 14%, transparent)`, color: toneVar(m.band) }}>{m.status.replace('_', ' ')}</span>
              {canMutate && m.status !== 'accepted' && <button disabled={pending} onClick={() => act(() => advanceMilestone(m.id), 'Milestone accepted')} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2 flex-none disabled:opacity-50">Accept</button>}
            </div>
          ))}
          {milestones.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No milestones.</div>}
        </div>
      </section>

      {editing && <ProgressDialog task={editing} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function ProgressDialog({ task, onClose, onDone }: { task: GanttTask; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pct, setPct] = useState(String(task.percentComplete));
  const [error, setError] = useState<string | null>(null);
  function save() { setError(null); start(async () => { const r = await updateTaskProgress(task.id, Number(pct)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`${task.name} → ${pct}%`); }); }
  function escalate() { start(async () => { const r = await escalateTaskToIssue(task.id); if (r.ok) { router.refresh(); onDone('Escalated to a site issue'); } else setError(r.error); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Update progress</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{task.name}</div><div className="text-text-3">{task.owner} · {task.critical ? 'on the critical path' : `${task.slackDays}d float`}</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Percent complete</label>
        <input type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(e.target.value)} className="w-full" />
        <div className="text-[20px] font-bold tracking-[-0.02em] mt-1">{pct}%</div>
        {task.critical && <p className="text-[10.5px] mt-2" style={{ color: toneVar('warn') }}>This task has zero float — every day it slips moves the project finish.</p>}
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-between gap-2 mt-4">
          <button onClick={escalate} disabled={pending} className="h-9 px-3 rounded-lg border border-border-2 text-[12px] disabled:opacity-50">Escalate</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
            <button onClick={save} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
