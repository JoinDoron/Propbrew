'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vote, Scale, CheckCircle2, XCircle, Users, Gavel, ChevronRight, ThumbsUp, ThumbsDown, MinusCircle } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { motionTally, motionOutcome, motionStatusTone, MOTION_STATUS_LABEL, type MotionCategory, type MotionStatus, type VoteChoice } from '@/domain/estate';
import { castVote, openMotion, closeMotion } from '@/server/actions/estate';

export type MotionRow = { id: string; ref: string; title: string; summary: string; category: MotionCategory; status: MotionStatus; opensISO: string; closesISO: string; eligibleWeight: number; forWeight: number; againstWeight: number; abstainWeight: number; quorumPct: number; thresholdPct: number };

const CAT_LABEL: Record<MotionCategory, string> = { budget: 'Budget', rule: 'Bylaw', works: 'Works', board: 'Board' };
const CAT_TONE: Record<MotionCategory, Tone> = { budget: 'info', rule: 'progress', works: 'warn', board: 'success' };

export function GovernanceWorkspace({ motions, nowMs }: { motions: MotionRow[]; nowMs: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const open = motions.filter((m) => m.status === 'open');
  const avgTurnout = open.length ? Math.round(open.reduce((n, m) => n + motionTally(m).turnoutPct, 0) / open.length) : 0;
  const passed = motions.filter((m) => m.status === 'passed').length;
  const atRisk = open.filter((m) => !motionTally(m).quorumMet).length;
  const order: Record<MotionStatus, number> = { open: 0, draft: 1, passed: 2, rejected: 3, quorum_failed: 4 };
  const sorted = [...motions].sort((a, b) => order[a.status] - order[b.status]);

  const days = (iso: string) => Math.round((Date.parse(iso) - nowMs) / 86400000);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0b1a2e 0%,#122a4a 55%,#1c3d63 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Gavel size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><Vote size={12} /> GOVERNANCE · AGM 2026</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{open.length} motion{open.length === 1 ? '' : 's'} open for voting</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{avgTurnout}% average turnout · unit-weighted ballots · {atRisk} short of quorum</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Open motions" value={String(open.length)} tone="progress" icon={<Vote size={16} />} />
        <Kpi label="Avg turnout" value={`${avgTurnout}%`} tone={avgTurnout >= 33 ? 'success' : 'warn'} icon={<Users size={16} />} />
        <Kpi label="Passed" value={String(passed)} tone="success" icon={<CheckCircle2 size={16} />} />
        <Kpi label="Short of quorum" value={String(atRisk)} tone={atRisk ? 'warn' : 'success'} icon={<Scale size={16} />} />
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.map((m) => {
          const t = motionTally(m);
          const total = m.forWeight + m.againstWeight + m.abstainWeight || 1;
          const isOpen = m.status === 'open';
          const wouldBe = motionOutcome(m);
          return (
            <div key={m.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10.5px] font-mono text-text-3">{m.ref}</span>
                    <span className="text-[10px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(CAT_TONE[m.category])} 14%, transparent)`, color: toneVar(CAT_TONE[m.category]) }}>{CAT_LABEL[m.category]}</span>
                  </div>
                  <div className="text-[14px] font-semibold mt-0.5">{m.title}</div>
                  <div className="text-[11.5px] text-text-3 mt-0.5 max-w-[560px]">{m.summary}</div>
                </div>
                <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(motionStatusTone(m.status))} 14%, transparent)`, color: toneVar(motionStatusTone(m.status)) }}>{MOTION_STATUS_LABEL[m.status]}</span>
              </div>

              {m.status !== 'draft' && (
                <>
                  <div className="flex h-2.5 rounded-full overflow-hidden mt-3 bg-surface-2">
                    <div style={{ width: `${(m.forWeight / total) * 100}%`, background: toneVar('success') }} />
                    <div style={{ width: `${(m.againstWeight / total) * 100}%`, background: toneVar('danger') }} />
                    <div style={{ width: `${(m.abstainWeight / total) * 100}%`, background: toneVar('muted') }} />
                  </div>
                  <div className="flex gap-3 text-[11px] text-text-3 mt-1.5">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: toneVar('success') }} />For {m.forWeight}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: toneVar('danger') }} />Against {m.againstWeight}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: toneVar('muted') }} />Abstain {m.abstainWeight}</span>
                  </div>

                  <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3 mt-3">
                    <Meter label="Quorum" value={t.turnoutPct} marker={m.quorumPct} met={t.quorumMet} metLabel={`${t.turnoutPct}% turnout`} markLabel={`needs ${m.quorumPct}%`} />
                    <Meter label="Approval" value={t.approvalPct} marker={m.thresholdPct} met={t.thresholdMet} metLabel={`${t.approvalPct}% in favour`} markLabel={`needs ${m.thresholdPct}%`} />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {isOpen && <>
                  <span className="text-[11px] px-2 h-7 inline-flex items-center rounded-lg font-medium" style={{ background: `color-mix(in srgb, ${toneVar(t.passing ? 'success' : 'warn')} 12%, transparent)`, color: toneVar(t.passing ? 'success' : 'warn') }}>{t.passing ? 'On track to pass' : wouldBe === 'quorum_failed' ? 'Quorum not yet met' : 'Below threshold'}</span>
                  <span className="text-[10.5px] text-text-3">closes in {Math.max(0, days(m.closesISO))}d</span>
                  <div className="flex gap-1.5 ml-auto">
                    <button disabled={pending} onClick={() => act(() => castVote(m.id, 'for' as VoteChoice), 'Vote recorded · For')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium inline-flex items-center gap-1 disabled:opacity-50" style={{ background: `color-mix(in srgb, ${toneVar('success')} 12%, transparent)`, color: toneVar('success') }}><ThumbsUp size={12} /> For</button>
                    <button disabled={pending} onClick={() => act(() => castVote(m.id, 'against' as VoteChoice), 'Vote recorded · Against')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium inline-flex items-center gap-1 disabled:opacity-50" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 12%, transparent)`, color: toneVar('danger') }}><ThumbsDown size={12} /> Against</button>
                    <button disabled={pending} onClick={() => act(() => castVote(m.id, 'abstain' as VoteChoice), 'Vote recorded · Abstain')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium inline-flex items-center gap-1 border border-border-2 disabled:opacity-50"><MinusCircle size={12} /> Abstain</button>
                    <button disabled={pending} onClick={() => act(() => closeMotion(m.id), 'Motion closed')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium bg-text text-surface inline-flex items-center gap-1 disabled:opacity-50">Close vote</button>
                  </div>
                </>}
                {m.status === 'draft' && <button disabled={pending} onClick={() => act(() => openMotion(m.id), 'Voting opened')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium bg-primary text-white inline-flex items-center gap-1 ml-auto disabled:opacity-50">Open for voting <ChevronRight size={12} /></button>}
                {(m.status === 'passed' || m.status === 'rejected' || m.status === 'quorum_failed') && <span className="text-[11px] inline-flex items-center gap-1 ml-auto" style={{ color: toneVar(motionStatusTone(m.status)) }}>{m.status === 'passed' ? <CheckCircle2 size={13} /> : <XCircle size={13} />} Closed {m.closesISO}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Meter({ label, value, marker, met, metLabel, markLabel }: { label: string; value: number; marker: number; met: boolean; metLabel: string; markLabel: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-3">{label}</span><span className="font-mono font-semibold" style={{ color: toneVar(met ? 'success' : 'warn') }}>{metLabel}</span></div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative"><div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: toneVar(met ? 'success' : 'warn') }} /><span className="absolute top-[-2px] bottom-[-2px] w-px bg-text" style={{ left: `${Math.min(100, marker)}%` }} /></div>
      <div className="text-[10px] text-text-3 mt-1">{markLabel}</div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
