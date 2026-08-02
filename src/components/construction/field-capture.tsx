'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, WifiOff, Wifi, Camera, Check, Trash2, RefreshCw, TriangleAlert, CloudUpload, Plus, X } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { queueStats, syncPosture, OP_LABEL, STATUS_TONE, type OpKind } from '@/domain/sync';
import { useOutbox, useOnline, capture, removeOp, clearSynced, abandon, requeue, setForcedOffline, isForcedOffline } from '@/lib/offline/outbox';

export type FieldProject = { id: string; name: string; code: string };
export type FieldTask = { id: string; name: string; percentComplete: number };
export type FieldWorker = { id: string; name: string; trade: string };

type Tab = 'report' | 'issue' | 'progress' | 'queue';

export function FieldCapture({ projects, tasks, workers, todayISO }: {
  projects: FieldProject[]; tasks: FieldTask[]; workers: FieldWorker[]; todayISO: string;
}) {
  const router = useRouter();
  const ops = useOutbox();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>('report');
  const [toast, setToast] = useState<string | null>(null);
  const [forced, setForced] = useState(() => (typeof window === 'undefined' ? false : isForcedOffline()));

  const stats = queueStats(ops);
  const posture = syncPosture(stats, online);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const toggleOffline = () => {
    const next = !forced;
    setForcedOffline(next); setForced(next);
    flash(next ? 'Signal cut — capture still works, everything queues on this device' : 'Back online — the queue is draining now');
    if (!next) setTimeout(() => router.refresh(), 1200);
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#101408 0%,#1e2810 55%,#2d3c17 100%)' }}>
        <div className="relative flex items-center gap-3 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><HardHat size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5">
              FIELD CAPTURE ·
              <span className="inline-flex items-center gap-1" style={{ color: toneVar(posture.tone) }}>
                {online ? <Wifi size={11} /> : <WifiOff size={11} />} {posture.label}
              </span>
            </div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">Works with no signal</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{posture.detail}</div>
          </div>
          <button onClick={toggleOffline} className="ml-auto text-[12px] px-3 h-9 rounded-xl font-medium inline-flex items-center gap-1.5 flex-none" style={{ background: 'rgba(255,255,255,.12)' }}>
            {forced ? <><Wifi size={13} /> Restore signal</> : <><WifiOff size={13} /> Simulate no signal</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([['report', 'Daily report'], ['issue', 'Raise issue'], ['progress', 'Task progress'], ['queue', `Outbox${stats.pending + stats.conflicts ? ` (${stats.pending + stats.conflicts})` : ''}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="text-[12px] px-3 h-9 rounded-xl font-medium border transition-colors"
            style={tab === k ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : { borderColor: 'var(--border-2)', background: 'var(--surface)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'report' && <ReportForm projects={projects} todayISO={todayISO} onCaptured={flash} online={online} />}
      {tab === 'issue' && <IssueForm projects={projects} onCaptured={flash} online={online} />}
      {tab === 'progress' && <ProgressForm projects={projects} tasks={tasks} onCaptured={flash} online={online} />}
      {tab === 'queue' && <Outbox ops={ops} onToast={flash} />}

      {/* Attendance quick-punch is always visible — it's the most common field action. */}
      {tab !== 'queue' && (
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Quick attendance · {todayISO}</div>
          <div className="divide-y divide-border">
            {workers.slice(0, 6).map((w) => (
              <div key={w.id} className="px-4 py-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{w.name}</div><div className="text-[10.5px] text-text-3">{w.trade}</div></div>
                <button
                  onClick={() => { capture('attendance', `${w.name} present · ${todayISO}`, { workerId: w.id, projectId: projects[0]?.id ?? '', dateISO: todayISO, status: 'present', clockIn: '07:00' }); flash(`${w.name} clocked in — saved on this device`); }}
                  className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 flex-none"><Check size={12} /> Present</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade max-w-[92vw]">{toast}</div>}
    </div>
  );
}

/* --- capture forms -------------------------------------------------------- */

function ReportForm({ projects, todayISO, onCaptured, online }: { projects: FieldProject[]; todayISO: string; onCaptured: (m: string) => void; online: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [dateISO, setDateISO] = useState(todayISO);
  const [weather, setWeather] = useState('Fair · 29°C');
  const [crew, setCrew] = useState('42');
  const [completed, setCompleted] = useState<string[]>([]);
  const [ongoing, setOngoing] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [photos, setPhotos] = useState(0);

  const submit = () => {
    const name = projects.find((p) => p.id === projectId)?.name ?? 'Site';
    capture('daily_report', `Daily report · ${name} · ${dateISO}`, {
      projectId, dateISO, weather, shift: 'day', workforceCount: Number(crew) || 0,
      completed, ongoing, delayed: [], plannedNext: [], deliveries: [], incidents: [], constraints, photos,
    }, photos);
    setCompleted([]); setOngoing([]); setConstraints([]); setPhotos(0);
    onCaptured(online ? 'Report captured — sending now' : 'Report saved on this device — it will send itself when signal returns');
  };

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-2.5">
        <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="inpf">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} className="inpf" /></Field>
        <Field label="Crew on site"><input value={crew} onChange={(e) => setCrew(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpf" /></Field>
      </div>
      <Field label="Weather"><input value={weather} onChange={(e) => setWeather(e.target.value)} className="inpf" /></Field>

      <ListField label="Completed today" items={completed} setItems={setCompleted} placeholder="e.g. L4 columns struck" tone="success" />
      <ListField label="Ongoing" items={ongoing} setItems={setOngoing} placeholder="e.g. Rebar fixing to L4 slab" tone="progress" />
      <ListField label="Constraints" items={constraints} setItems={setConstraints} placeholder="e.g. Rebar delivery still outstanding" tone="warn" />

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setPhotos((p) => p + 1)} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1"><Camera size={12} /> Attach photo</button>
        {photos > 0 && <span className="text-[11.5px] text-text-3">{photos} photo{photos === 1 ? '' : 's'} held with this report</span>}
        <button onClick={submit} className="ml-auto text-[12.5px] px-4 h-10 rounded-xl bg-primary text-white font-medium inline-flex items-center gap-1.5"><Check size={14} /> Submit report</button>
      </div>
      <p className="text-[10.5px] text-text-3">Submitting saves to this device first. Photos ride along and are never dropped — the queue counts them separately so nothing looks lost.</p>
      <style>{`.inpf{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpf:focus{border-color:var(--primary)}`}</style>
    </section>
  );
}

function IssueForm({ projects, onCaptured, online }: { projects: FieldProject[]; onCaptured: (m: string) => void; online: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [action, setAction] = useState('');
  return (
    <section className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2.5">
        <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="inpf">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Severity"><select value={severity} onChange={(e) => setSeverity(e.target.value)} className="inpf"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
      </div>
      <Field label="What's wrong"><input value={title} onChange={(e) => setTitle(e.target.value)} className="inpf" placeholder="e.g. Honeycombing on L3 column C4" /></Field>
      <Field label="Corrective action"><input value={action} onChange={(e) => setAction(e.target.value)} className="inpf" placeholder="e.g. Break out and re-pour, QS to price" /></Field>
      <button
        disabled={!title.trim()}
        onClick={() => { capture('site_issue', `Issue · ${title.trim()}`, { projectId, title: title.trim(), severity, category: 'Quality', correctiveAction: action.trim() }); setTitle(''); setAction(''); onCaptured(online ? 'Issue captured — sending now' : 'Issue saved on this device'); }}
        className="self-start text-[12.5px] px-4 h-10 rounded-xl bg-primary text-white font-medium disabled:opacity-40 inline-flex items-center gap-1.5"><Check size={14} /> Raise issue</button>
      <style>{`.inpf{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpf:focus{border-color:var(--primary)}`}</style>
    </section>
  );
}

function ProgressForm({ projects, tasks, onCaptured, online }: { projects: FieldProject[]; tasks: FieldTask[]; onCaptured: (m: string) => void; online: boolean }) {
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '');
  const task = tasks.find((t) => t.id === taskId);
  const [pct, setPct] = useState(String(task?.percentComplete ?? 0));
  return (
    <section className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3">
      <Field label="Task">
        <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setPct(String(tasks.find((t) => t.id === e.target.value)?.percentComplete ?? 0)); }} className="inpf">
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.percentComplete}%</option>)}
        </select>
      </Field>
      <div>
        <div className="flex justify-between text-[11px] mb-1"><span className="text-text-3">Percent complete</span><span className="font-mono font-bold text-[15px]">{pct}%</span></div>
        <input type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(e.target.value)} className="w-full" aria-label="Percent complete" />
        {task && Number(pct) < task.percentComplete && <p className="text-[10.5px] mt-1" style={{ color: toneVar('warn') }}>Lower than the {task.percentComplete}% already on the server — this will be flagged as a conflict rather than silently overwriting it.</p>}
      </div>
      <button
        onClick={() => { capture('task_progress', `${task?.name ?? 'Task'} → ${pct}%`, { taskId, percentComplete: Number(pct), projectId: projects[0]?.id ?? '' }); onCaptured(online ? 'Progress captured — sending now' : 'Progress saved on this device'); }}
        className="self-start text-[12.5px] px-4 h-10 rounded-xl bg-primary text-white font-medium inline-flex items-center gap-1.5"><Check size={14} /> Record progress</button>
      <style>{`.inpf{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpf:focus{border-color:var(--primary)}`}</style>
    </section>
  );
}

/* --- outbox inspector ----------------------------------------------------- */

function Outbox({ ops, onToast }: { ops: ReturnType<typeof useOutbox>; onToast: (m: string) => void }) {
  const router = useRouter();
  const stats = queueStats(ops);
  const sorted = [...ops].sort((a, b) => (a.status === 'synced' ? 1 : 0) - (b.status === 'synced' ? 1 : 0) || Date.parse(a.capturedISO) - Date.parse(b.capturedISO));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Waiting to send" value={String(stats.pending)} tone={stats.pending ? 'warn' : 'success'} />
        <Kpi label="Sending" value={String(stats.sending)} tone={stats.sending ? 'progress' : 'muted'} />
        <Kpi label="Needs review" value={String(stats.conflicts)} tone={stats.conflicts ? 'danger' : 'success'} />
        <Kpi label="Synced" value={String(stats.synced)} tone="success" />
      </div>

      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span className="text-[12.5px] font-semibold">Device outbox</span>
          <span className="text-[10.5px] text-text-3">· survives reload and restart</span>
          {stats.synced > 0 && <button onClick={() => { clearSynced(); onToast('Cleared synced receipts'); }} className="ml-auto text-[11px] text-text-3 hover:text-primary">Clear synced</button>}
        </div>
        <div className="divide-y divide-border">
          {sorted.map((o) => (
            <div key={o.id} className={`px-4 py-3 ${o.status === 'synced' ? 'opacity-55' : ''}`} style={o.status === 'conflict' ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                    {o.label}
                    <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[o.status])} 14%, transparent)`, color: toneVar(STATUS_TONE[o.status]) }}>{o.status}</span>
                    {o.attachments > 0 && <span className="text-[9.5px] text-text-3 inline-flex items-center gap-0.5"><Camera size={9} /> {o.attachments}</span>}
                  </div>
                  <div className="text-[10.5px] text-text-3 mt-0.5 font-mono">{OP_LABEL[o.kind as OpKind]} · id {o.id.slice(0, 8)} · captured {new Date(o.capturedISO).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  {o.error && <div className="text-[11px] mt-1" style={{ color: toneVar(STATUS_TONE[o.status]) }}>{o.error}</div>}
                  {o.serverState && <div className="text-[11px] text-text-3 mt-0.5">Server has: <span className="font-medium">{o.serverState}</span></div>}
                </div>
                <div className="flex items-center gap-1.5 flex-none">
                  {o.status === 'conflict' && (
                    <>
                      <button onClick={() => { requeue(o.id); onToast('Re-queued — will try again'); }} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1"><RefreshCw size={11} /> Retry</button>
                      <button onClick={async () => { await abandon(o.id); onToast('Discarded — the server keeps its version'); router.refresh(); }} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1" style={{ color: toneVar('danger') }}><Trash2 size={11} /> Discard mine</button>
                    </>
                  )}
                  {o.status === 'failed' && <button onClick={() => { requeue(o.id); onToast('Re-queued'); }} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1"><RefreshCw size={11} /> Retry now</button>}
                  {o.status === 'synced' && <button onClick={() => removeOp(o.id)} className="w-7 h-7 rounded-lg grid place-items-center text-text-3" title="Remove receipt"><X size={13} /></button>}
                </div>
              </div>
            </div>
          ))}
          {ops.length === 0 && (
            <div className="px-4 py-10 text-center">
              <CloudUpload size={20} className="mx-auto mb-2 text-text-3" />
              <div className="text-[13px] font-medium">Outbox empty</div>
              <div className="text-[11.5px] text-text-3 mt-1">Capture a report or issue — it saves here first, then syncs itself.</div>
            </div>
          )}
        </div>
      </section>

      <div className="text-[11px] text-text-3 flex items-start gap-1.5">
        <TriangleAlert size={12} className="mt-0.5 flex-none" />
        Each record carries a client-generated id that the server treats as an idempotency key: if a send times out and retries, the server recognises the id and confirms the original instead of applying it twice. Conflicts are server-authoritative — your copy is held, never silently overwritten, until you decide.
      </div>
    </div>
  );
}

/* --- bits ----------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">{label}</label>{children}</div>;
}
function ListField({ label, items, setItems, placeholder, tone }: { label: string; items: string[]; setItems: (v: string[]) => void; placeholder: string; tone: Tone }) {
  const [draft, setDraft] = useState('');
  const add = () => { if (draft.trim()) { setItems([...items, draft.trim()]); setDraft(''); } };
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[.04em] mb-1" style={{ color: toneVar(tone) }}>{label}</label>
      <div className="flex gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} className="flex-1 h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" />
        <button onClick={add} className="w-9 h-9 rounded-lg border border-border-2 grid place-items-center flex-none"><Plus size={14} /></button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {items.map((it, i) => (
            <span key={i} className="text-[11px] px-2 h-6 inline-flex items-center gap-1 rounded-full bg-surface-2">
              {it}
              <button onClick={() => setItems(items.filter((_, k) => k !== i))} className="text-text-3 hover:text-negative"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
function Kpi({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><div className="text-[11px] text-text-3 font-medium">{label}</div><div className="text-[19px] font-bold tracking-[-0.02em] leading-none mt-1.5" style={{ color: toneVar(tone) }}>{value}</div></div>;
}
