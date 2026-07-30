'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, Users, CalendarClock, Vote, Gavel, Plus, X, Check, CalendarCheck, FileText, UserPlus, Crown, Trophy, Scale, Zap } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { termStatus, meetingState, MOTION_STATUS_LABEL, electionTally, electionWinner, ELECTION_STATUS_LABEL, electionStatusTone, motionTally, proxyWeights, projectedTally, type BoardRole, type MeetingType, type MeetingStatus, type MotionStatus, type ElectionStatus, type ProxyStatus, type VoteChoice } from '@/domain/estate';
import { createMotion, recordMeetingHeld, nominateCandidate, openElectionVoting, decideElection, exerciseProxies, type CreateMotionInput, type NominateInput } from '@/server/actions/estate';

export type BoardRow = { id: string; name: string; unitLabel: string; role: BoardRole; portfolio: string; sinceISO: string; termEndISO: string };
export type MeetingRow = { id: string; title: string; type: MeetingType; whenISO: string; venue: string; status: MeetingStatus; resolutions: number; attendees: number; quorumRequired: number };
export type CandidateRow = { id: string; residentName: string; unitLabel: string; statement: string; votes: number };
export type ElectionRow = { id: string; ref: string; seatTitle: string; portfolio: string; status: ElectionStatus; closesISO: string; eligibleWeight: number; quorumPct: number; candidates: CandidateRow[]; winnerCandidateId?: string };
export type ProxyRow = { id: string; grantorName: string; grantorUnit: string; holderName: string; direction: VoteChoice; status: ProxyStatus };
export type EgmMotion = { id: string; ref: string; title: string; meetingLabel: string; forWeight: number; againstWeight: number; abstainWeight: number; eligibleWeight: number; quorumPct: number; thresholdPct: number };
export type EgmData = { motion: EgmMotion; proxies: ProxyRow[] } | null;

const ROLE_TONE: Record<BoardRole, Tone> = { Chair: 'success', Treasurer: 'info', Secretary: 'progress', Member: 'muted' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });

export function BoardWorkspace({ members, meetings, elections, egm, motionCounts, nowMs }: {
  members: BoardRow[]; meetings: MeetingRow[]; elections: ElectionRow[]; egm: EgmData;
  motionCounts: Record<MotionStatus, number>; nowMs: number;
}) {
  const [showMotion, setShowMotion] = useState(false);
  const [heldFor, setHeldFor] = useState<MeetingRow | null>(null);
  const [nominateFor, setNominateFor] = useState<ElectionRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const scheduled = meetings.filter((m) => m.status === 'scheduled').sort((a, b) => Date.parse(a.whenISO) - Date.parse(b.whenISO));
  const held = meetings.filter((m) => m.status === 'held').sort((a, b) => Date.parse(b.whenISO) - Date.parse(a.whenISO));
  const next = scheduled[0];
  const termsEnding = members.filter((m) => termStatus(m, nowMs).daysLeft <= 90).length;
  const openMotions = motionCounts.open + motionCounts.draft;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#101a12 0%,#183024 55%,#20463218 100%),linear-gradient(135deg,#12241a,#1c3d2b)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Landmark size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">RESIDENTS’ COMMITTEE</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{members.length}-member board</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{next ? `Next: ${next.title} · ${day(next.whenISO)}` : 'No meeting scheduled'}</div>
          </div>
          <button onClick={() => setShowMotion(true)} className="ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl font-semibold text-[13px] bg-white text-[#183024]"><Plus size={15} /> Table a motion</button>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Committee" value={String(members.length)} tone="info" icon={<Users size={16} />} />
        <Kpi label="Next meeting" value={next ? day(next.whenISO).split(',')[0] : '—'} tone="progress" icon={<CalendarClock size={16} />} />
        <Kpi label="Motions in play" value={String(openMotions)} tone={openMotions ? 'warn' : 'success'} icon={<Vote size={16} />} />
        <Kpi label="Terms ending" value={String(termsEnding)} tone={termsEnding ? 'warn' : 'success'} icon={<Gavel size={16} />} />
      </div>

      {egm && <EgmCard egm={egm} onToast={flash} />}
      {elections.map((el) => <ElectionCard key={el.id} el={el} nowMs={nowMs} onNominate={() => setNominateFor(el)} onToast={flash} />)}

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Roster */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Users size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Committee roster</span></div>
          <div className="divide-y divide-border">
            {members.map((m) => {
              const term = termStatus(m, nowMs);
              return (
                <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full grid place-items-center flex-none text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${toneVar(ROLE_TONE[m.role])} 16%, transparent)`, color: toneVar(ROLE_TONE[m.role]) }}>{m.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{m.name} <span className="text-[10.5px] font-medium" style={{ color: toneVar(ROLE_TONE[m.role]) }}>· {m.role}</span></div>
                    <div className="text-[11px] text-text-3 truncate">{m.portfolio} · {m.unitLabel}</div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(term.band)} 14%, transparent)`, color: toneVar(term.band) }}>{term.daysLeft < 0 ? term.label : `${Math.round(term.daysLeft / 30)}mo left`}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Meetings */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><CalendarClock size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Meetings</span></div>
          <div className="divide-y divide-border">
            {[...scheduled, ...held].map((m) => {
              const st = meetingState(m, nowMs);
              return (
                <div key={m.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-[12.5px] font-semibold truncate">{m.title}</div><div className="text-[10.5px] text-text-3">{m.type} · {day(m.whenISO)} · {m.venue}</div></div>
                    <span className="text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(st.tone)} 14%, transparent)`, color: toneVar(st.tone) }}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10.5px] text-text-3">{m.status === 'held' ? `${m.resolutions} resolutions · ${m.attendees}/${m.quorumRequired} present` : `quorum ${m.quorumRequired}`}</span>
                    {m.status === 'scheduled' && <button onClick={() => setHeldFor(m)} className="ml-auto text-[11px] px-2.5 h-7 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1"><CalendarCheck size={11} /> Mark held</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Motion pipeline */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-2.5"><FileText size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Motion pipeline</span><a href="/governance" className="ml-auto text-[11px] text-primary font-medium">Open governance →</a></div>
        <div className="grid grid-cols-3 min-[560px]:grid-cols-5 gap-2">
          {(['draft', 'open', 'passed', 'rejected', 'quorum_failed'] as MotionStatus[]).map((s) => (
            <div key={s} className="rounded-xl bg-surface-2 px-3 py-2.5">
              <div className="text-[17px] font-bold leading-none">{motionCounts[s]}</div>
              <div className="text-[10px] text-text-3 mt-1">{MOTION_STATUS_LABEL[s]}</div>
            </div>
          ))}
        </div>
      </section>

      {showMotion && <MotionDialog onClose={() => setShowMotion(false)} onDone={(ref) => { setShowMotion(false); flash(`Motion tabled · ${ref}`); }} />}
      {heldFor && <HeldDialog meeting={heldFor} onClose={() => setHeldFor(null)} onDone={() => { setHeldFor(null); flash('Meeting recorded'); }} />}
      {nominateFor && <NominateDialog el={nominateFor} onClose={() => setNominateFor(null)} onDone={(n) => { setNominateFor(null); flash(`Nominated · ${n}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function MotionDialog({ onClose, onDone }: { onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<CreateMotionInput>({ title: '', summary: '', category: 'works', quorumPct: 33, thresholdPct: 50 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CreateMotionInput, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await createMotion(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? ''); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Table a motion</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="flex flex-col gap-2.5">
          <div><label className="lblb">Title</label><input value={f.title} onChange={(e) => set('title', e.target.value)} className="inpb" autoFocus placeholder="e.g. Approve gym refurbishment" /></div>
          <div><label className="lblb">Summary</label><textarea value={f.summary} onChange={(e) => set('summary', e.target.value)} className="inpb" style={{ height: 56, padding: '8px 10px' }} placeholder="What residents are voting on…" /></div>
          <div className="grid grid-cols-3 gap-2.5">
            <div><label className="lblb">Type</label><select value={f.category} onChange={(e) => set('category', e.target.value)} className="inpb"><option value="works">Works</option><option value="budget">Budget</option><option value="rule">Bylaw</option><option value="board">Board</option></select></div>
            <div><label className="lblb">Quorum %</label><input value={String(f.quorumPct)} onChange={(e) => set('quorumPct', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} inputMode="numeric" className="inpb" /></div>
            <div><label className="lblb">Pass %</label><input value={String(f.thresholdPct)} onChange={(e) => set('thresholdPct', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} inputMode="numeric" className="inpb" /></div>
          </div>
        </div>
        <p className="text-[10.5px] text-text-3 mt-2">Tabled as a draft — open it for voting from Governance.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !f.title.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Tabling…' : 'Table motion'}</button></div>
        <style>{`.lblb{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpb{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none;font-family:inherit;resize:none}.inpb:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}

function HeldDialog({ meeting, onClose, onDone }: { meeting: MeetingRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [attendees, setAttendees] = useState(String(meeting.quorumRequired));
  function submit() { start(async () => { const r = await recordMeetingHeld(meeting.id, Number(attendees)); if (r.ok) { router.refresh(); onDone(); } }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[320px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Record meeting</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{meeting.title}</div><div className="text-text-3">Quorum {meeting.quorumRequired} required</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Attendees present</label>
        <input value={attendees} onChange={(e) => setAttendees(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" autoFocus />
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Mark held'}</button></div>
      </div>
    </div>
  );
}
const DIR_TONE: Record<VoteChoice, Tone> = { for: 'success', against: 'danger', abstain: 'muted' };
const PROXY_TONE: Record<ProxyStatus, Tone> = { held: 'progress', exercised: 'success', revoked: 'muted' };

function EgmCard({ egm, onToast }: { egm: NonNullable<EgmData>; onToast: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { motion: m, proxies } = egm;
  const t = motionTally(m);
  const held = proxies.filter((p) => p.status === 'held');
  const w = proxyWeights(held);
  const proj = projectedTally(m, held);
  const exercised = proxies.filter((p) => p.status === 'exercised').length;
  const act = () => start(async () => { const r = await exerciseProxies(m.id); if (r.ok) { router.refresh(); onToast(`Proxies cast · ${r.ref}`); } else onToast(r.error ?? 'Failed'); });

  return (
    <section className="bg-surface border rounded-2xl shadow-card overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--tone-progress) 40%, transparent)' }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('progress')} 14%, transparent)`, color: toneVar('progress') }}><Scale size={16} /></span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold flex items-center gap-1.5">EGM · {m.title}<span className="text-[10px] font-mono text-text-3">{m.ref}</span></div>
          <div className="text-[11px] text-text-3">{m.meetingLabel} · proxy voting open</div>
        </div>
        <span className="ml-auto text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(t.quorumMet ? 'success' : 'warn')} 14%, transparent)`, color: toneVar(t.quorumMet ? 'success' : 'warn') }}>{t.turnoutPct}% turnout {t.quorumMet ? '· quorate' : `· needs ${m.quorumPct}%`}</span>
      </div>

      {/* quorum meter with projected extension */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-3">Quorum {held.length > 0 && !t.quorumMet && <span style={{ color: toneVar('progress') }}>· +{held.length} proxies projected</span>}</span><span className="font-mono" style={{ color: toneVar(proj.quorumMet ? 'success' : 'warn') }}>{proj.turnoutPct}% with proxies</span></div>
        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden relative flex">
          <div className="h-full" style={{ width: `${Math.min(100, t.turnoutPct)}%`, background: toneVar('progress') }} />
          <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, proj.turnoutPct) - t.turnoutPct)}%`, background: `repeating-linear-gradient(45deg, ${toneVar('progress')}, ${toneVar('progress')} 3px, transparent 3px, transparent 6px)` }} />
          <span className="absolute top-[-2px] bottom-[-2px] w-px bg-text" style={{ left: `${Math.min(100, m.quorumPct)}%` }} />
        </div>
        <div className="text-[10.5px] mt-1" style={{ color: toneVar(proj.addsQuorum ? 'success' : 'muted') }}>{proj.addsQuorum ? `Exercising ${held.length} held ${held.length === 1 ? 'proxy' : 'proxies'} carries quorum → ${proj.passing ? 'motion passes' : 'still below approval threshold'}.` : t.quorumMet ? 'Quorum already met.' : `${held.length} held · not enough to reach quorum yet.`}</div>
      </div>

      {/* proxy register */}
      <div className="px-4 py-2 mt-1 text-[11px] font-semibold text-text-2 flex items-center gap-1.5"><Users size={12} /> Proxy register · {w.forW} for · {w.againstW} against{exercised ? ` · ${exercised} cast` : ''}</div>
      <div className="divide-y divide-border max-h-[200px] overflow-y-auto">
        {proxies.map((p) => (
          <div key={p.id} className="px-4 py-2 flex items-center gap-2">
            <div className="min-w-0 flex-1"><div className="text-[12px] font-medium truncate">{p.grantorUnit} <span className="text-text-3 font-normal">→ {p.holderName}</span></div><div className="text-[10px] text-text-3">{p.grantorName}</div></div>
            <span className="text-[10px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(DIR_TONE[p.direction])} 14%, transparent)`, color: toneVar(DIR_TONE[p.direction]) }}>{p.direction}</span>
            <span className="text-[10px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PROXY_TONE[p.status])} 14%, transparent)`, color: toneVar(PROXY_TONE[p.status]) }}>{p.status}</span>
          </div>
        ))}
        {proxies.length === 0 && <div className="px-4 py-4 text-center text-[12px] text-text-3">No proxies assigned yet.</div>}
      </div>
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <span className="text-[11px] text-text-3">{held.length} awaiting the Chair</span>
        <button disabled={pending || held.length === 0} onClick={act} className="ml-auto text-[11.5px] px-3 h-8 rounded-lg font-medium bg-primary text-white inline-flex items-center gap-1 disabled:opacity-40"><Zap size={12} /> {pending ? 'Casting…' : 'Exercise proxies'}</button>
      </div>
    </section>
  );
}

function ElectionCard({ el, nowMs, onNominate, onToast }: { el: ElectionRow; nowMs: number; onNominate: () => void; onToast: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = electionTally(el);
  const winner = el.status === 'decided' ? el.candidates.find((c) => c.id === el.winnerCandidateId) : null;
  const wouldWin = electionWinner(el);
  const closes = Math.max(0, Math.round((Date.parse(el.closesISO) - nowMs) / 86400000));
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); onToast(r.ref ? `${ok} · ${r.ref}` : ok); } else onToast(r.error ?? 'Failed'); });

  return (
    <section className="bg-surface border rounded-2xl shadow-card overflow-hidden" style={{ borderColor: el.status === 'voting' ? 'color-mix(in srgb, var(--tone-progress) 40%, transparent)' : 'var(--border)' }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 14%, transparent)`, color: toneVar('warn') }}><Crown size={16} /></span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold flex items-center gap-1.5">Board election · {el.seatTitle}<span className="text-[10px] font-mono text-text-3">{el.ref}</span></div>
          <div className="text-[11px] text-text-3">Vacant seat · {el.portfolio}</div>
        </div>
        <span className="ml-auto text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(electionStatusTone(el.status))} 14%, transparent)`, color: toneVar(electionStatusTone(el.status)) }}>{ELECTION_STATUS_LABEL[el.status]}</span>
      </div>

      {winner ? (
        <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: 'color-mix(in srgb, var(--tone-success) 7%, transparent)' }}>
          <Trophy size={18} style={{ color: toneVar('success') }} />
          <div className="text-[13px]"><span className="font-semibold">{winner.residentName}</span> elected to the seat — {winner.votes} votes ({t.turnoutPct}% turnout). Now on the committee.</div>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-3">Quorum</span><span className="font-mono font-semibold" style={{ color: toneVar(t.quorumMet ? 'success' : 'warn') }}>{t.turnoutPct}% turnout {t.quorumMet ? '· met' : `· needs ${el.quorumPct}%`}</span></div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative"><div className="h-full rounded-full" style={{ width: `${Math.min(100, t.turnoutPct)}%`, background: toneVar(t.quorumMet ? 'success' : 'warn') }} /><span className="absolute top-[-2px] bottom-[-2px] w-px bg-text" style={{ left: `${Math.min(100, el.quorumPct)}%` }} /></div>
          </div>
          <div className="divide-y divide-border mt-2">
            {t.ranked.map(({ candidate: c, pct }, i) => (
              <div key={c.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-text-3 w-4 flex-none">{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{c.residentName} <span className="text-[10.5px] text-text-3 font-normal">· {c.unitLabel}</span>{el.status === 'voting' && wouldWin?.id === c.id && <span className="ml-1.5 text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('success')} 14%, transparent)`, color: toneVar('success') }}>leading</span>}</div></div>
                  <span className="text-[11px] font-mono text-text-3 flex-none">{c.votes} · {pct}%</span>
                </div>
                <div className="text-[10.5px] text-text-3 mt-0.5 ml-6">{c.statement}</div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1 ml-6"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: toneVar(wouldWin?.id === c.id ? 'success' : 'progress') }} /></div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap border-t border-border">
            <span className="text-[11px] text-text-3">{el.status === 'voting' ? `closes in ${closes}d · ` : ''}{el.candidates.length} standing</span>
            <div className="ml-auto flex gap-2">
              <button disabled={pending} onClick={onNominate} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><UserPlus size={12} /> Nominate</button>
              {el.status === 'nominations' && <button disabled={pending} onClick={() => act(() => openElectionVoting(el.id), 'Voting opened')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium bg-primary text-white inline-flex items-center gap-1 disabled:opacity-50">Open voting</button>}
              {el.status === 'voting' && <button disabled={pending} onClick={() => act(() => decideElection(el.id), 'Seat filled')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium bg-text text-surface inline-flex items-center gap-1 disabled:opacity-50" title={wouldWin ? `Declare ${wouldWin.residentName}` : 'Quorum not met / tie'}><Gavel size={12} /> Close & declare</button>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function NominateDialog({ el, onClose, onDone }: { el: ElectionRow; onClose: () => void; onDone: (n: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<NominateInput>({ name: '', unitLabel: '', statement: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof NominateInput, v: string) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await nominateCandidate(el.id, f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? f.name); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Nominate a candidate</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12px] text-text-3">{el.seatTitle} · {el.portfolio}</div>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lblb">Name</label><input value={f.name} onChange={(e) => set('name', e.target.value)} className="inpb" autoFocus placeholder="Resident name" /></div>
            <div><label className="lblb">Unit</label><input value={f.unitLabel} onChange={(e) => set('unitLabel', e.target.value)} className="inpb" placeholder="Block C · 09A" /></div>
          </div>
          <div><label className="lblb">Manifesto</label><textarea value={f.statement} onChange={(e) => set('statement', e.target.value)} className="inpb" style={{ height: 56, padding: '8px 10px' }} placeholder="Why they’re standing…" /></div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !f.name.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Adding…' : 'Add candidate'}</button></div>
        <style>{`.lblb{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpb{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none;font-family:inherit;resize:none}.inpb:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[15px] font-bold tracking-[-0.02em] leading-none mt-1 truncate">{value}</div></div>;
}
