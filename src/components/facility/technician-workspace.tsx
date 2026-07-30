'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Pause, Check, RotateCcw, MapPin, Clock, CircleCheck, Flame, Wrench, ChevronRight } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fireWoTransition } from '@/server/actions/work-orders';

export type Job = { ref: string; title: string; priority: string; status: string; origin: string; dueISO: string | null; location: string; assetName?: string };

const PRIORITY_TONE: Record<string, Tone> = { emergency: 'danger', high: 'warn', routine: 'info' };
const ORIGIN_LABEL: Record<string, string> = { resident_request: 'Resident', manager: 'Manager', ppm_schedule: 'PPM', failed_inspection: 'Inspection', sensor_alarm: 'Sensor alarm' };
const NEXT: Record<string, { event: string; label: string; icon: React.ReactNode; primary?: boolean }[]> = {
  assigned: [{ event: 'START', label: 'Start job', icon: <Play size={15} />, primary: true }],
  in_progress: [{ event: 'RESOLVE', label: 'Mark resolved', icon: <Check size={15} />, primary: true }, { event: 'HOLD', label: 'Hold', icon: <Pause size={14} /> }],
  on_hold: [{ event: 'RESUME', label: 'Resume', icon: <Play size={15} />, primary: true }, { event: 'RESOLVE', label: 'Resolve', icon: <Check size={14} /> }],
};

function countdown(iso: string | null, nowMs: number): { text: string; tone: Tone } {
  if (!iso) return { text: 'no SLA', tone: 'muted' };
  const diff = Date.parse(iso) - nowMs;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000), m = Math.floor((abs % 3600000) / 60000);
  const label = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return diff < 0 ? { text: `${label} overdue`, tone: 'danger' } : { text: `${label} left`, tone: diff < 4 * 3600000 ? 'warn' : 'success' };
}

export function TechnicianWorkspace({ jobs, techName, nowMs }: { jobs: Job[]; techName: string; nowMs: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const clockMs = nowMs + tick * 30000;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const onNow = jobs.filter((j) => j.status === 'in_progress');
  const upNext = jobs.filter((j) => j.status === 'assigned');
  const waiting = jobs.filter((j) => j.status === 'on_hold');
  const done = jobs.filter((j) => ['resolved', 'verified', 'closed'].includes(j.status));
  const active = [...onNow, ...upNext, ...waiting];
  const nextDue = active.map((j) => j.dueISO).filter(Boolean).sort()[0] ?? null;

  function fire(ref: string, event: string, label: string) {
    setBusy(ref);
    start(async () => { const r = await fireWoTransition(ref, event); setBusy(null); if (r.ok) { router.refresh(); flash(`${ref} · ${label}`); } else flash(r.error); });
  }

  return (
    <div className="max-w-[520px] mx-auto flex flex-col gap-3">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0b1220 0%,#123a53 100%)' }}>
        <div className="text-[11px] text-white/70">Good day, {techName.split(' ')[0]}</div>
        <div className="text-[19px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{active.length} job{active.length === 1 ? '' : 's'} to do today</div>
        <div className="flex items-center gap-3 mt-2.5">
          <Pill label="On now" value={onNow.length} />
          <Pill label="Up next" value={upNext.length} />
          <Pill label="Waiting" value={waiting.length} />
          <Pill label="Done" value={done.length} />
        </div>
        {nextDue && <div className="mt-2.5 text-[11.5px] text-white/80 inline-flex items-center gap-1"><Clock size={12} /> Next SLA: {countdown(nextDue, clockMs).text}</div>}
      </div>

      {active.length === 0 && <div className="bg-surface border border-border rounded-2xl shadow-card p-8 text-center text-[13px] text-text-3 flex flex-col items-center gap-2"><CircleCheck size={28} className="text-positive" /> All caught up — no open jobs.</div>}

      {onNow.length > 0 && <Section title="On now">{onNow.map((j) => <JobCard key={j.ref} job={j} nowMs={clockMs} busy={busy === j.ref || pending} onFire={fire} />)}</Section>}
      {upNext.length > 0 && <Section title="Up next">{upNext.map((j) => <JobCard key={j.ref} job={j} nowMs={clockMs} busy={busy === j.ref || pending} onFire={fire} />)}</Section>}
      {waiting.length > 0 && <Section title="Waiting / on hold">{waiting.map((j) => <JobCard key={j.ref} job={j} nowMs={clockMs} busy={busy === j.ref || pending} onFire={fire} />)}</Section>}
      {done.length > 0 && (
        <Section title={`Done today · ${done.length}`}>
          {done.map((j) => (
            <div key={j.ref} className="bg-surface border border-border rounded-xl shadow-card px-3.5 py-2.5 flex items-center gap-2.5 opacity-75">
              <CircleCheck size={16} className="text-positive flex-none" />
              <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate line-through decoration-text-3/40">{j.title}</div><div className="text-[10.5px] text-text-3 font-mono">{j.ref} · {j.status}</div></div>
            </div>
          ))}
        </Section>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function JobCard({ job, nowMs, busy, onFire }: { job: Job; nowMs: number; busy: boolean; onFire: (ref: string, event: string, label: string) => void }) {
  const cd = countdown(job.dueISO, nowMs);
  const pt = PRIORITY_TONE[job.priority] ?? 'neutral';
  const actions = NEXT[job.status] ?? [];
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-start gap-2.5">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(pt)} 14%, transparent)`, color: toneVar(pt) }}>{job.priority === 'emergency' ? <Flame size={17} /> : <Wrench size={17} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-tight">{job.title}</div>
          <div className="text-[11px] text-text-3 mt-0.5 flex items-center gap-1.5 flex-wrap"><span className="font-mono">{job.ref}</span> · {ORIGIN_LABEL[job.origin] ?? job.origin}{job.assetName && <> · {job.assetName}</>}</div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(pt)} 14%, transparent)`, color: toneVar(pt) }}>{job.priority}</span>
            <span className="text-[11px] inline-flex items-center gap-1 text-text-3"><MapPin size={11} /> {job.location}</span>
            <span className="text-[11px] inline-flex items-center gap-1 font-medium" style={{ color: toneVar(cd.tone) }}><Clock size={11} /> {cd.text}</span>
          </div>
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2 mt-3">
          {actions.map((a) => (
            <button key={a.event} disabled={busy} onClick={() => onFire(job.ref, a.event, a.label)}
              className={`flex-1 h-11 rounded-xl font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${a.primary ? 'bg-primary text-white' : 'border border-border-2 text-text-2'}`}>
              {a.event === 'HOLD' ? <Pause size={15} /> : a.event === 'RESUME' ? <RotateCcw size={15} /> : a.icon} {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[.05em] text-text-3 px-1 flex items-center gap-1"><ChevronRight size={12} /> {title}</div>
      {children}
    </div>
  );
}
function Pill({ label, value }: { label: string; value: number }) {
  return <div className="text-center"><div className="text-[17px] font-bold leading-none">{value}</div><div className="text-[9.5px] text-white/60 uppercase tracking-wide mt-0.5">{label}</div></div>;
}
