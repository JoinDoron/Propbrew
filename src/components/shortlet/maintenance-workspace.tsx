'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Clock, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { suggestPriority, ISSUE_NEXT, type IssuePriority, type IssueStatus } from '@/domain/shortlet/operations';
import { logIssue, advanceIssue } from '@/server/actions/shortlet';

export type IssueRow = { id: string; apt: string; apartmentId: string; title: string; description: string; priority: IssuePriority; status: IssueStatus; createdAt: string; resolvedAt?: string };
export type Stats = { open: number; inProgress: number; resolvedThisMonth: number };

const PRIORITY_TONE: Record<IssuePriority, Tone> = { low: 'neutral', medium: 'info', high: 'warn', urgent: 'danger' };
const STATUS_TONE: Record<IssueStatus, Tone> = { open: 'warn', in_progress: 'progress', resolved: 'success' };
const STATUS_LABEL: Record<IssueStatus, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };

export function MaintenanceWorkspace({ issues, apartments, stats }: { issues: IssueRow[]; apartments: { id: string; name: string }[]; stats: Stats }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<'all' | IssueStatus>('all');
  const [apt, setApt] = useState('all');
  const [logging, setLogging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const advance = (id: string, label: string) => start(async () => { const r = await advanceIssue(id); if (r.ok) { router.refresh(); flash(`${label}`); } else flash(r.error); });

  const shown = issues.filter((i) => (tab === 'all' || i.status === tab) && (apt === 'all' || i.apartmentId === apt));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-text-3">{stats.open + stats.inProgress} active · {stats.resolvedThisMonth} resolved this month</div>
        <button onClick={() => setLogging(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105"><Plus size={16} /> Log issue</button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="Open" value={String(stats.open)} note="awaiting action" tone={stats.open ? 'warn' : 'success'} icon={<AlertTriangle size={16} />} />
        <Kpi label="In progress" value={String(stats.inProgress)} note="being worked on" tone="progress" icon={<Clock size={16} />} />
        <Kpi label="Resolved" value={String(stats.resolvedThisMonth)} note="this month" tone="success" icon={<CheckCircle2 size={16} />} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {(['all', 'open', 'in_progress', 'resolved'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium border ${tab === t ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{t === 'all' ? 'All' : STATUS_LABEL[t]}</button>
          ))}
        </div>
        <select value={apt} onChange={(e) => setApt(e.target.value)} className="ml-auto h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12px]"><option value="all">All apartments</option>{apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-2xl"><CheckCircle2 size={24} className="mx-auto text-text-3 mb-2" /><p className="text-[13px] font-medium">No issues here</p></div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((i) => {
            const next = ISSUE_NEXT[i.status];
            return (
              <div key={i.id} className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13.5px] font-semibold truncate">{i.title}</span>
                      <span className="text-[9.5px] font-bold uppercase px-1.5 h-4 inline-flex items-center rounded" style={{ background: `color-mix(in srgb, ${toneVar(PRIORITY_TONE[i.priority])} 16%, transparent)`, color: toneVar(PRIORITY_TONE[i.priority]) }}>{i.priority}</span>
                    </div>
                    <div className="text-[11.5px] text-text-3">{i.apt} · logged {i.createdAt.slice(5)}{i.description ? ` · ${i.description}` : ''}</div>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[i.status])} 14%, transparent)`, color: toneVar(STATUS_TONE[i.status]) }}>{STATUS_LABEL[i.status]}</span>
                </div>
                {next && <div className="mt-2.5"><button disabled={pending} onClick={() => advance(i.id, next.label)} className="text-[11.5px] px-3 h-7 rounded-lg bg-primary text-white font-medium disabled:opacity-50">{next.label}</button></div>}
              </div>
            );
          })}
        </div>
      )}

      {logging && <LogDialog apartments={apartments} onClose={() => setLogging(false)} onDone={() => { setLogging(false); flash('Issue logged'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
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

  function submit() { setError(null); start(async () => { const r = await logIssue({ apartmentId: aptId, title, description: desc, priority: effective }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Log new issue</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <label className="lblm">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AC not cooling in bedroom" className="inpm mb-2" autoFocus />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div><label className="lblm">Apartment</label><select value={aptId} onChange={(e) => setAptId(e.target.value)} className="inpm">{apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label className="lblm">Priority</label><select value={effective} onChange={(e) => { setPriority(e.target.value as IssuePriority); setTouched(true); }} className="inpm capitalize">{(['low', 'medium', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        </div>
        {suggested && !touched && <p className="text-[10.5px] text-primary mb-2 flex items-center gap-1"><Sparkles size={11} /> Suggested priority: <b className="capitalize">{suggested}</b> — from the title</p>}
        <label className="lblm">Description (optional)</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="When it started, what the guest said, any photos…" className="inpm !h-auto py-2 resize-none" />
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !title.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Logging…' : 'Log issue'}</button></div>
        <style>{`.lblm{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpm{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpm:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[19px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div><div className="text-[10px] mt-1" style={{ color: toneVar(tone) }}>{note}</div></div>;
}
