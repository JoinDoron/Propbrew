'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Check, X, Banknote, TrendingUp, ArrowRight, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';
import { submitTimesheet, approveTimesheet, rejectTimesheet } from '@/server/actions/construction';

export type SheetRow = {
  id: string; ref: string; workerName: string; weekEndingISO: string; costCode: string;
  normalHours: number; overtimeHours: number; status: string; submittedBy: string;
  approvedBy?: string; approvedISO?: string; costMinor: number; band: Tone; dayRateMinor: number;
};
export type CodeRow = { code: string; name: string; postedMinor: number; pendingMinor: number; hours: number; actualMinor: number; budgetMinor: number };

const naira = (m: number) => `₦${fmtM(m)}`;
const exact = (m: number) => `₦${Math.round(m / 100).toLocaleString('en-NG')}`;

export function TimesheetsWorkspace({ sheets, byCode, posture, projectName, canMutate }: {
  sheets: SheetRow[]; byCode: CodeRow[];
  posture: { postedMinor: number; pendingMinor: number; pendingSheets: number; overtimeHours: number };
  projectName: string; canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectFor, setRejectFor] = useState<SheetRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  const awaiting = sheets.filter((s) => s.status === 'submitted');
  const sorted = [...sheets].sort((a, b) => {
    const rank = (s: string) => (s === 'submitted' ? 0 : s === 'draft' ? 1 : s === 'approved' ? 2 : 3);
    return rank(a.status) - rank(b.status) || b.weekEndingISO.localeCompare(a.weekEndingISO);
  });

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero — the point of the page */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0b1018 0%,#152130 55%,#1f3348 100%)' }}>
        <div className="relative flex items-center gap-3 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Clock size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">TIMESHEETS · {projectName.toUpperCase()}</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">
              {posture.pendingMinor > 0
                ? <><span style={{ color: toneVar('warn') }}>{naira(posture.pendingMinor)}</span> of labour the forecast can&apos;t see yet</>
                : 'All labour is posted to cost'}
            </div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{naira(posture.postedMinor)} already posted · {posture.pendingSheets} sheet{posture.pendingSheets === 1 ? '' : 's'} awaiting approval · {posture.overtimeHours}h overtime booked</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Posted to actuals" value={naira(posture.postedMinor)} tone="success" icon={<Banknote size={16} />} />
        <Kpi label="Not yet in EVM" value={naira(posture.pendingMinor)} tone={posture.pendingMinor ? 'warn' : 'success'} icon={<TrendingUp size={16} />} />
        <Kpi label="Awaiting approval" value={String(awaiting.length)} tone={awaiting.length ? 'warn' : 'success'} icon={<Clock size={16} />} />
        <Kpi label="Overtime hours" value={`${posture.overtimeHours}h`} tone={posture.overtimeHours > 20 ? 'warn' : 'info'} icon={<Clock size={16} />} />
      </div>

      {posture.pendingMinor > 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-2" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' }}>
          <Info size={14} className="mt-0.5 flex-none" style={{ color: toneVar('warn') }} />
          <div className="text-[12px] text-text-2">
            Approving a timesheet <span className="font-medium">posts its cost to the cost code&apos;s actual</span>, which is what makes labour appear in earned value. Until then, {naira(posture.pendingMinor)} of real spend is invisible to CPI — the forecast is flattering.
            <Link href="/construction/evm" className="ml-1 text-primary font-medium inline-flex items-center gap-0.5">Earned Value <ArrowRight size={11} /></Link>
          </div>
        </div>
      )}

      {/* Sheets */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Timesheets</div>
        <div className="divide-y divide-border">
          {sorted.map((s) => (
            <div key={s.id} className={`px-4 py-3 ${s.status === 'rejected' ? 'opacity-55' : ''}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[11px]">{s.ref}</span> {s.workerName}
                    <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(s.band)} 14%, transparent)`, color: toneVar(s.band) }}>{s.status}</span>
                  </div>
                  <div className="text-[10.5px] text-text-3 mt-0.5">
                    week ending {s.weekEndingISO} · {s.costCode} · {s.normalHours}h normal
                    {s.overtimeHours > 0 && <span style={{ color: toneVar('warn') }}> + {s.overtimeHours}h OT @1.5×</span>}
                    {' · '}{exact(s.dayRateMinor)}/day
                  </div>
                  {s.approvedBy && <div className="text-[10.5px] mt-0.5" style={{ color: toneVar('success') }}>posted by {s.approvedBy} on {s.approvedISO}</div>}
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <div className="text-right">
                    <div className="text-[14px] font-bold tracking-[-0.02em] font-mono leading-none">{exact(s.costMinor)}</div>
                    <div className="text-[9.5px] text-text-3 mt-0.5">{s.status === 'approved' ? 'posted' : 'not posted'}</div>
                  </div>
                  {canMutate && s.status === 'draft' && <button disabled={pending} onClick={() => act(() => submitTimesheet(s.id), 'Submitted')} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 disabled:opacity-50">Submit</button>}
                  {canMutate && s.status === 'submitted' && (
                    <>
                      <button disabled={pending} onClick={() => setRejectFor(s)} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 disabled:opacity-50" style={{ color: toneVar('danger') }}>Reject</button>
                      <button disabled={pending} onClick={() => act(() => approveTimesheet(s.id), 'Approved')} className="text-[11px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Approve &amp; post</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Where the labour lands */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Labour by cost code <span className="text-[10.5px] text-text-3 font-normal">· posted vs pending against each code&apos;s actual</span></div>
        <div className="divide-y divide-border">
          {byCode.map((c) => {
            const max = Math.max(1, c.budgetMinor);
            return (
              <div key={c.code} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="min-w-0"><span className="text-[12.5px] font-medium">{c.name}</span> <span className="text-[10.5px] text-text-3 font-mono">{c.code}</span></div>
                  <div className="text-[11px] text-text-3 flex-none">{c.hours}h · <span style={{ color: toneVar('success') }}>{naira(c.postedMinor)} posted</span>{c.pendingMinor > 0 && <> · <span style={{ color: toneVar('warn') }}>{naira(c.pendingMinor)} pending</span></>}</div>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative flex">
                  <div className="h-full" style={{ width: `${Math.min(100, (c.actualMinor / max) * 100)}%`, background: toneVar('progress') }} title={`actual ${naira(c.actualMinor)}`} />
                  <div className="h-full" style={{ width: `${Math.min(100, (c.pendingMinor / max) * 100)}%`, background: `color-mix(in srgb, ${toneVar('warn')} 60%, transparent)` }} title={`pending labour ${naira(c.pendingMinor)}`} />
                </div>
                <div className="text-[10px] text-text-3 mt-1">actual {naira(c.actualMinor)} of {naira(c.budgetMinor)} budget{c.pendingMinor > 0 ? ` — would become ${naira(c.actualMinor + c.pendingMinor)} once these sheets are approved` : ''}</div>
              </div>
            );
          })}
          {byCode.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No labour booked yet.</div>}
        </div>
      </section>

      {rejectFor && <RejectDialog sheet={rejectFor} onClose={() => setRejectFor(null)} onDone={(m) => { setRejectFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade max-w-[92vw]">{toast}</div>}
    </div>
  );
}

function RejectDialog({ sheet, onClose, onDone }: { sheet: SheetRow; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await rejectTimesheet(sheet.id, reason); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Rejected · ${r.ref}`); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Reject timesheet</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{sheet.ref} · {sheet.workerName}</div><div className="text-text-3">{sheet.normalHours}h + {sheet.overtimeHours}h OT · {exact(sheet.costMinor)}</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Reason (required)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-16 p-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary resize-none" autoFocus placeholder="e.g. Overtime not pre-authorised for this week" />
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !reason.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Reject'}</button></div>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
