'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, CloudSun, Users, Camera, Check, Undo2, Send, X, TriangleAlert, BookOpen } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { submitReport, reviewReport, approveDailyReport, returnDailyReport } from '@/server/actions/construction';

export type ReportRow = {
  id: string; projectName: string; dateISO: string; weather: string; shift: string; officer: string;
  workforceCount: number; completed: string[]; ongoing: string[]; delayed: string[]; plannedNext: string[];
  deliveries: string[]; incidents: string[]; constraints: string[]; photos: number; status: string;
  band: Tone; completenessPct: number; missing: string[]; attendanceCount: number; inconsistent: boolean;
};

const NEXT: Record<string, string> = { draft: 'Submit', returned: 'Resubmit', submitted: 'Review', reviewed: 'Approve' };

export function SiteWorkspace({ reports, gaps, kpis, canMutate }: {
  reports: ReportRow[]; gaps: string[];
  kpis: { approved: number; pending: number; coverage: number; incidents: number };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [returnFor, setReturnFor] = useState<ReportRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const advance = (r: ReportRow) => {
    if (r.status === 'draft' || r.status === 'returned') return act(() => submitReport(r.id), 'Report submitted');
    if (r.status === 'submitted') return act(() => reviewReport(r.id), 'Report reviewed');
    return act(() => approveDailyReport(r.id), 'Report approved — it now feeds the site diary and digest');
  };

  const diary = reports.filter((r) => r.status === 'approved').sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Approved reports" value={String(kpis.approved)} tone="success" icon={<ClipboardCheck size={16} />} />
        <Kpi label="Awaiting action" value={String(kpis.pending)} tone={kpis.pending ? 'warn' : 'success'} icon={<Send size={16} />} />
        <Kpi label="7-day coverage" value={`${kpis.coverage}%`} tone={kpis.coverage >= 85 ? 'success' : 'warn'} icon={<BookOpen size={16} />} />
        <Kpi label="Incidents logged" value={String(kpis.incidents)} tone={kpis.incidents ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
      </div>

      {gaps.length > 0 && (
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' }}>
          <div className="text-[12.5px] font-semibold mb-1" style={{ color: toneVar('warn') }}>Reporting gaps</div>
          <p className="text-[11.5px] text-text-2">No <span className="font-medium">approved</span> report for {gaps.slice(0, 5).join(', ')}{gaps.length > 5 ? ` +${gaps.length - 5} more` : ''} — the digest will say so rather than invent progress.</p>
        </div>
      )}

      {/* Reports */}
      <div className="flex flex-col gap-2.5">
        {reports.map((r) => (
          <section key={r.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold flex items-center gap-1.5 flex-wrap">
                  {r.projectName} · {r.dateISO}
                  <span className="text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(r.band)} 14%, transparent)`, color: toneVar(r.band) }}>{r.status}</span>
                </div>
                <div className="text-[11px] text-text-3 flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="inline-flex items-center gap-1"><CloudSun size={11} /> {r.weather}</span>
                  <span className="inline-flex items-center gap-1"><Users size={11} /> {r.workforceCount} on site</span>
                  <span className="inline-flex items-center gap-1"><Camera size={11} /> {r.photos}</span>
                  <span>· {r.officer} · {r.shift} shift</span>
                </div>
              </div>
              <CompletenessRing pct={r.completenessPct} />
            </div>

            {r.inconsistent && (
              <div className="mt-2.5 text-[11px] rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ background: 'color-mix(in srgb, var(--tone-warn) 8%, transparent)', color: toneVar('warn') }}>
                <TriangleAlert size={12} className="mt-0.5 flex-none" /> Workforce count ({r.workforceCount}) differs by more than 15% from geofenced attendance ({r.attendanceCount}) — confirm before approving.
              </div>
            )}
            {r.missing.length > 0 && <div className="mt-2 text-[11px] text-text-3">Missing: {r.missing.join(', ')}</div>}

            <div className="grid grid-cols-1 min-[640px]:grid-cols-2 gap-x-4 gap-y-2 mt-3">
              <Field label="Completed" items={r.completed} tone="success" />
              <Field label="Ongoing" items={r.ongoing} tone="progress" />
              <Field label="Delayed" items={r.delayed} tone="danger" />
              <Field label="Planned next" items={r.plannedNext} tone="info" />
              {r.deliveries.length > 0 && <Field label="Deliveries" items={r.deliveries} tone="info" />}
              {r.incidents.length > 0 && <Field label="Incidents" items={r.incidents} tone="warn" />}
              {r.constraints.length > 0 && <Field label="Constraints" items={r.constraints} tone="warn" />}
            </div>

            {canMutate && r.status !== 'approved' && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button disabled={pending} onClick={() => advance(r)} className="text-[11.5px] px-3 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check size={12} /> {NEXT[r.status] ?? 'Advance'}</button>
                {(r.status === 'submitted' || r.status === 'reviewed') && <button disabled={pending} onClick={() => setReturnFor(r)} className="text-[11.5px] px-3 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Undo2 size={12} /> Return</button>}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Site diary */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold flex items-center gap-2"><BookOpen size={14} className="text-text-3" /> Site diary <span className="text-[10.5px] text-text-3 font-normal">· approved records only, chronological</span></div>
        <div className="divide-y divide-border">
          {diary.map((r) => (
            <div key={r.id} className="px-4 py-2.5">
              <div className="text-[12px] font-medium">{r.dateISO} · {r.projectName}</div>
              <div className="text-[11px] text-text-3 mt-0.5">{[...r.completed, ...r.ongoing].join('; ') || 'No activities recorded'}{r.incidents.length ? ` · Incident: ${r.incidents.join('; ')}` : ''}</div>
            </div>
          ))}
          {diary.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">Nothing approved yet — the diary stays empty until a report is signed off.</div>}
        </div>
      </section>

      {returnFor && <ReturnDialog report={returnFor} onClose={() => setReturnFor(null)} onDone={() => { setReturnFor(null); flash('Returned to the site engineer'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function ReturnDialog({ report, onClose, onDone }: { report: ReportRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await returnDailyReport(report.id, reason); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Return report</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{report.projectName} · {report.dateISO}</div><div className="text-text-3">{report.officer}</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Reason (required)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs correcting?" className="w-full h-16 p-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary resize-none" autoFocus />
        <p className="text-[10.5px] text-text-3 mt-1.5">The reason is attached to the record and the report drops back to draft.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !reason.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Returning…' : 'Return'}</button></div>
      </div>
    </div>
  );
}
function Field({ label, items, tone }: { label: string; items: string[]; tone: Tone }) {
  if (items.length === 0) return <div><div className="text-[10px] font-semibold uppercase tracking-wide text-text-3">{label}</div><div className="text-[11.5px] text-text-3">—</div></div>;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: toneVar(tone) }}>{label}</div>
      <ul className="text-[11.5px] text-text-2 flex flex-col gap-0.5">{items.map((it, i) => <li key={i}>· {it}</li>)}</ul>
    </div>
  );
}
function CompletenessRing({ pct }: { pct: number }) {
  const band: Tone = pct >= 90 ? 'success' : pct >= 60 ? 'warn' : 'danger';
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 52, height: 52 }}>
      <svg width={52} height={52} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className="text-[12px] font-bold" style={{ color }}>{pct}%</span></div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
