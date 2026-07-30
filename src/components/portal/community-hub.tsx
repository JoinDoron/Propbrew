'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vote, PartyPopper, Award, ThumbsUp, ThumbsDown, MinusCircle, Check, Star, Gift, CalendarDays, MapPin, Crown, Scale, X, Package, Megaphone, ClipboardList, Trophy, Undo2 } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';
import { motionTally, electionTally, tierFor, tierProgress, TIER_TONE, eventFillPct, isEventFull, type VoteChoice, type MotionStatus, type RewardTier, type EventCategory } from '@/domain/estate';
import { residentVote, residentRsvp, residentRedeem, residentVoteCandidate, residentAssignProxy, residentRevokeProxy, residentSelfNominate, residentCollectParcel, dismissProxyNotice } from '@/server/actions/resident-community';

export type MyProxy = { holderName: string; direction: VoteChoice; status: string };
export type PMotion = { id: string; ref: string; title: string; summary: string; status: MotionStatus; forWeight: number; againstWeight: number; abstainWeight: number; eligibleWeight: number; quorumPct: number; thresholdPct: number; closesISO: string; myChoice?: VoteChoice; egm?: boolean; myProxy?: MyProxy };

// Chair/Secretary, plus neighbours you can delegate to (who may delegate onward).
const PROXY_HOLDERS = ['Chair · Ngozi Okafor', 'Secretary · Ada Obi', 'Yusuf Bello', 'Tobi Ade', 'Kemi Adeyinka'];
export type PEvent = { id: string; title: string; category: EventCategory; venue: string; startISO: string; capacity: number; rsvps: number };
export type MyRewards = { points: number; onTimeStreak: number; eventsAttended: number; pollsVoted: number; rank: number; total: number } | null;
export type PPerk = { id: string; title: string; detail: string; cost: number; stock: number };
export type PCandidate = { id: string; residentName: string; unitLabel: string; statement: string; votes: number };
export type PElection = { id: string; ref: string; seatTitle: string; portfolio: string; closesISO: string; eligibleWeight: number; quorumPct: number; candidates: PCandidate[]; myCandidateId?: string; canStand: boolean; myStanding?: { votes: number } } | null;
export type PParcel = { id: string; code: string; courier: string; size: string; status: string; lockerLabel?: string; receivedISO: string; overdue: boolean };
export type PNotice = { id: string; motionRef: string; motionTitle: string; reason: string };

const TIER_LABEL: Record<RewardTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
const CHOICE_LABEL: Record<VoteChoice, string> = { for: 'For', against: 'Against', abstain: 'Abstain' };
const pts = (n: number) => n.toLocaleString('en-NG');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });

export function CommunityHub({ firstName, motions, events, rewards, perks, election, parcels, notices }: {
  firstName: string; motions: PMotion[]; events: PEvent[]; rewards: MyRewards; perks: PPerk[]; election: PElection; parcels: PParcel[]; notices: PNotice[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const tier = rewards ? tierFor(rewards.points) : 'bronze';
  const prog = rewards ? tierProgress(rewards.points) : null;
  const openMotions = motions.filter((m) => m.status === 'open');

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#241145 0%,#3a1c63 55%,#4c2a7a 100%)' }}>
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] text-white/70">YOUR COMMUNITY</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">Hi {firstName} 👋</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{openMotions.length} open vote{openMotions.length === 1 ? '' : 's'} · {events.length} event{events.length === 1 ? '' : 's'} coming up</div>
          </div>
          {rewards && (
            <div className="text-right">
              <div className="text-[24px] font-bold leading-none">{pts(rewards.points)}</div>
              <div className="text-[11px] text-white/70 mt-0.5">points · <span className="capitalize">{TIER_LABEL[tier]}</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Returned-proxy notices */}
      {notices.map((n) => (
        <div key={n.id} className="rounded-2xl border shadow-card p-3.5 flex items-start gap-3 animate-fade" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 40%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 7%, transparent)' }}>
          <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 15%, transparent)`, color: toneVar('warn') }}><Undo2 size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">Your proxy was returned</div>
            <div className="text-[11.5px] text-text-2 mt-0.5">{n.reason} Your vote on <span className="font-medium">{n.motionRef}{n.motionTitle ? ` · ${n.motionTitle}` : ''}</span> is yours again — vote directly below.</div>
          </div>
          <button disabled={pending} onClick={() => act(() => dismissProxyNotice(n.id), 'Dismissed')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium border border-border-2 flex-none disabled:opacity-50">Got it</button>
        </div>
      ))}

      {/* My parcels */}
      {parcels.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Package size={15} className="text-text-3" /><span className="text-[13px] font-semibold">My parcels</span><span className="ml-auto text-[10.5px] text-text-3">{parcels.length} waiting{parcels.some((p) => p.overdue) ? ' · collect soon' : ''}</span></div>
          <div className="divide-y divide-border">
            {parcels.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(p.overdue ? 'danger' : 'progress')} 13%, transparent)`, color: toneVar(p.overdue ? 'danger' : 'progress') }}><Package size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold flex items-center gap-1.5">{p.courier} <span className="text-[10.5px] text-text-3 font-normal">· size {p.size}</span>{p.overdue && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 14%, transparent)`, color: toneVar('danger') }}>overdue</span>}</div>
                  <div className="text-[10.5px] text-text-3 flex items-center gap-1 mt-0.5">{p.lockerLabel ? <><MapPin size={10} /> Locker {p.lockerLabel}</> : 'At the front desk'} · {day(p.receivedISO)}</div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-[10px] text-text-3 uppercase tracking-wide">Pickup code</div>
                  <div className="text-[15px] font-bold font-mono tracking-[0.02em] leading-tight" style={{ color: toneVar('progress') }}>{p.code}</div>
                  <button disabled={pending} onClick={() => act(() => residentCollectParcel(p.id), 'Parcel collected 🎉')} className="mt-1 text-[11px] px-2.5 h-7 rounded-lg font-medium bg-primary text-white disabled:opacity-50 inline-flex items-center gap-1"><Check size={11} /> Confirm pickup</button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-surface-2 text-[10.5px] text-text-3">Enter your code at the locker, then confirm pickup here to free it up.</div>
        </section>
      )}

      {/* Votes */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Vote size={15} className="text-text-3" /><span className="text-[13px] font-semibold">Open votes</span><span className="ml-auto text-[10.5px] text-text-3">one vote per home</span></div>
        <div className="divide-y divide-border">
          {openMotions.map((m) => {
            const t = motionTally(m); const total = m.forWeight + m.againstWeight + m.abstainWeight || 1;
            return (
              <div key={m.id} className="px-4 py-3">
                <div className="text-[13px] font-semibold">{m.title}</div>
                <div className="text-[11.5px] text-text-3 mt-0.5">{m.summary}</div>
                <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-surface-2">
                  <div style={{ width: `${(m.forWeight / total) * 100}%`, background: toneVar('success') }} />
                  <div style={{ width: `${(m.againstWeight / total) * 100}%`, background: toneVar('danger') }} />
                  <div style={{ width: `${(m.abstainWeight / total) * 100}%`, background: toneVar('muted') }} />
                </div>
                <div className="text-[10.5px] text-text-3 mt-1">{t.turnoutPct}% turnout {t.quorumMet ? '· quorate' : `· needs ${m.quorumPct}%`} · {t.approvalPct}% in favour · closes {day(m.closesISO)}{m.egm ? ' · EGM' : ''}</div>
                {m.myChoice ? (
                  <div className="mt-2 text-[12px] font-medium inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg" style={{ background: `color-mix(in srgb, ${toneVar('success')} 12%, transparent)`, color: toneVar('success') }}><Check size={13} /> You voted {CHOICE_LABEL[m.myChoice]}</div>
                ) : m.myProxy ? (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-medium inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg" style={{ background: `color-mix(in srgb, ${toneVar(m.myProxy.status === 'expired' ? 'muted' : 'progress')} 12%, transparent)`, color: toneVar(m.myProxy.status === 'expired' ? 'muted' : 'progress') }}><Scale size={13} /> Proxy to {m.myProxy.holderName.replace(/^.*· /, '')} · {CHOICE_LABEL[m.myProxy.direction]}{m.myProxy.status === 'exercised' ? ' · cast ✓' : m.myProxy.status === 'expired' ? ' · lapsed (meeting closed)' : ''}</span>
                    {m.myProxy.status === 'held' && <button disabled={pending} onClick={() => act(() => residentRevokeProxy(m.id), 'Proxy revoked')} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 disabled:opacity-50">Revoke</button>}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1.5 mt-2">
                      <button disabled={pending} onClick={() => act(() => residentVote(m.id, 'for'), 'Your vote is in · For')} className="flex-1 text-[12px] px-2.5 h-9 rounded-lg font-medium inline-flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: `color-mix(in srgb, ${toneVar('success')} 12%, transparent)`, color: toneVar('success') }}><ThumbsUp size={13} /> For</button>
                      <button disabled={pending} onClick={() => act(() => residentVote(m.id, 'against'), 'Your vote is in · Against')} className="flex-1 text-[12px] px-2.5 h-9 rounded-lg font-medium inline-flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 12%, transparent)`, color: toneVar('danger') }}><ThumbsDown size={13} /> Against</button>
                      <button disabled={pending} onClick={() => act(() => residentVote(m.id, 'abstain'), 'Your vote is in · Abstain')} className="text-[12px] px-2.5 h-9 rounded-lg font-medium inline-flex items-center justify-center gap-1 border border-border-2 disabled:opacity-50"><MinusCircle size={13} /></button>
                    </div>
                    {m.egm && <ProxyPicker motionId={m.id} pending={pending} onAssign={(holder, dir) => act(() => residentAssignProxy(m.id, holder, dir), 'Proxy assigned')} />}
                  </>
                )}
              </div>
            );
          })}
          {openMotions.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No open votes right now.</div>}
        </div>
      </section>

      {/* Board election */}
      {election && (() => {
        const t = electionTally(election);
        const voted = election.candidates.find((c) => c.id === election.myCandidateId);
        return (
          <section className="bg-surface border rounded-2xl shadow-card overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)' }}>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Crown size={15} style={{ color: toneVar('warn') }} /><span className="text-[13px] font-semibold">Board election</span><span className="ml-auto text-[10.5px] text-text-3">one vote per home</span></div>
            <div className="px-4 pt-3">
              <div className="text-[12.5px] font-semibold">{election.seatTitle}</div>
              <div className="text-[11px] text-text-3">Vacant seat · {election.portfolio} · closes {day(election.closesISO)}</div>
              <div className="text-[10.5px] mt-1.5" style={{ color: toneVar(t.quorumMet ? 'success' : 'warn') }}>{t.turnoutPct}% turnout {t.quorumMet ? '· quorate ✓' : `· needs ${election.quorumPct}% to count`}</div>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {election.candidates.map((c) => {
                const mine = election.myCandidateId === c.id;
                const pct = t.ranked.find((r) => r.candidate.id === c.id)?.pct ?? 0;
                return (
                  <div key={c.id} className="rounded-xl border p-2.5" style={{ borderColor: mine ? toneVar('success') : 'var(--border)', background: mine ? `color-mix(in srgb, ${toneVar('success')} 7%, transparent)` : 'transparent' }}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold truncate">{c.residentName} <span className="text-[10.5px] text-text-3 font-normal">· {c.unitLabel}</span></div><div className="text-[10.5px] text-text-3">{c.statement}</div></div>
                      {election.myCandidateId ? <span className="text-[10.5px] font-mono text-text-3 flex-none">{c.votes} · {pct}%</span>
                        : <button disabled={pending} onClick={() => act(() => residentVoteCandidate(election.id, c.id), `Voted · ${c.residentName}`)} className="text-[11.5px] px-3 h-8 rounded-lg font-medium bg-primary text-white disabled:opacity-50 flex-none">Vote</button>}
                    </div>
                    {election.myCandidateId && <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1.5"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: toneVar(mine ? 'success' : 'progress') }} /></div>}
                  </div>
                );
              })}
            </div>
            {voted && <div className="px-4 pb-2 -mt-1 text-[12px] font-medium inline-flex items-center gap-1.5" style={{ color: toneVar('success') }}><Check size={13} /> You voted for {voted.residentName}</div>}
            {election.canStand && <StandForm pending={pending} onStand={(statement) => act(() => residentSelfNominate(election.id, statement), 'You’re standing for the board 🎉')} />}
          </section>
        );
      })()}

      {/* My nominations & standings */}
      {(() => {
        const electionCandidate = election?.candidates.find((c) => c.id === election.myCandidateId);
        return (
          <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><ClipboardList size={15} className="text-text-3" /><span className="text-[13px] font-semibold">My governance</span></div>
            <div className="divide-y divide-border">
              {election?.myStanding && (
                <div className="px-4 py-2.5 flex items-center gap-2.5">
                  <Trophy size={15} style={{ color: toneVar('warn') }} className="flex-none" />
                  <div className="text-[12.5px] flex-1">You’re <span className="font-semibold">standing for {election.seatTitle}</span></div>
                  <span className="text-[11px] font-mono text-text-3">{election.myStanding.votes} vote{election.myStanding.votes === 1 ? '' : 's'}</span>
                </div>
              )}
              {electionCandidate && !election?.myStanding && (
                <div className="px-4 py-2.5 flex items-center gap-2.5"><Crown size={15} style={{ color: toneVar('success') }} className="flex-none" /><div className="text-[12.5px] flex-1">Board election — you voted for <span className="font-semibold">{electionCandidate.residentName}</span></div></div>
              )}
              {openMotions.map((m) => {
                const done = m.myChoice || m.myProxy;
                return (
                  <div key={m.id} className="px-4 py-2.5 flex items-center gap-2.5">
                    <Vote size={14} className="flex-none" style={{ color: toneVar(done ? 'success' : 'muted') }} />
                    <div className="text-[12px] flex-1 min-w-0"><span className="font-mono text-[10.5px] text-text-3">{m.ref}</span> <span className="truncate">{m.title}</span></div>
                    <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full flex-none whitespace-nowrap" style={{ background: `color-mix(in srgb, ${toneVar(m.myChoice ? 'success' : m.myProxy ? 'progress' : 'muted')} 13%, transparent)`, color: toneVar(m.myChoice ? 'success' : m.myProxy ? 'progress' : 'muted') }}>
                      {m.myChoice ? `voted ${CHOICE_LABEL[m.myChoice]}` : m.myProxy ? (m.myProxy.status === 'exercised' ? 'proxy cast' : m.myProxy.status === 'expired' ? 'proxy lapsed' : 'proxy given') : 'not yet voted'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Events */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><PartyPopper size={15} className="text-text-3" /><span className="text-[13px] font-semibold">What’s on</span></div>
        <div className="divide-y divide-border">
          {events.map((e) => {
            const full = isEventFull(e);
            return (
              <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{e.title}</div>
                  <div className="text-[11px] text-text-3 flex items-center gap-1"><CalendarDays size={11} /> {day(e.startISO)} · <MapPin size={11} /> {e.venue}</div>
                  <div className="flex items-center gap-2 mt-1.5"><div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden max-w-[160px]"><div className="h-full rounded-full" style={{ width: `${eventFillPct(e)}%`, background: toneVar(full ? 'danger' : 'success') }} /></div><span className="text-[10px] text-text-3">{e.rsvps}/{e.capacity}</span></div>
                </div>
                <button disabled={pending || full} onClick={() => act(() => residentRsvp(e.id), 'You’re on the list 🎉')} className="text-[12px] px-3 h-9 rounded-lg font-medium bg-primary text-white disabled:opacity-40 flex-none">{full ? 'Full' : 'RSVP'}</button>
              </div>
            );
          })}
          {events.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No upcoming events.</div>}
        </div>
      </section>

      {/* Rewards */}
      {rewards && (
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Award size={15} className="text-text-3" /><span className="text-[13px] font-semibold">My rewards</span><span className="ml-auto text-[10.5px] text-text-3">#{rewards.rank} of {rewards.total}</span></div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(TIER_TONE[tier])} 16%, transparent)`, color: toneVar(TIER_TONE[tier]) }}><Star size={20} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold capitalize">{TIER_LABEL[tier]} · {pts(rewards.points)} pts</div>
                {prog?.next && <><div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1.5"><div className="h-full rounded-full" style={{ width: `${prog.pct}%`, background: toneVar(TIER_TONE[tier]) }} /></div><div className="text-[10px] text-text-3 mt-1">{pts(prog.toNext)} pts to {TIER_LABEL[prog.next]}</div></>}
              </div>
            </div>
            <div className="flex gap-2 mt-2.5 text-[10.5px] text-text-3">
              <span>🔥 {rewards.onTimeStreak}mo on-time</span><span>· 🎟 {rewards.eventsAttended} events</span><span>· 🗳 {rewards.pollsVoted} votes</span>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-border text-[11px] font-semibold text-text-2 flex items-center gap-1.5"><Gift size={13} /> Spend your points</div>
          <div className="divide-y divide-border">
            {perks.map((p) => {
              const can = rewards.points >= p.cost && p.stock > 0;
              return (
                <div key={p.id} className="px-4 py-2.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{p.title}</div><div className="text-[10.5px] text-text-3 truncate">{p.detail} · {p.stock} left</div></div>
                  <span className="text-[11px] font-bold flex-none" style={{ color: toneVar('warn') }}>{pts(p.cost)}</span>
                  <button disabled={pending || !can} onClick={() => act(() => residentRedeem(p.id), `Redeemed · ${p.title}`)} className="text-[11px] px-2.5 h-7 rounded-lg font-medium bg-primary text-white disabled:opacity-40 flex-none">{p.stock === 0 ? 'Out' : 'Redeem'}</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function StandForm({ pending, onStand }: { pending: boolean; onStand: (statement: string) => void }) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState('');
  if (!open) return (
    <div className="px-4 pb-3 pt-1 border-t border-border mt-1">
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-medium inline-flex items-center gap-1.5" style={{ color: toneVar('warn') }}><Megaphone size={13} /> Stand for this seat</button>
    </div>
  );
  return (
    <div className="mx-3 mb-3 mt-1 rounded-xl border border-border p-2.5 bg-surface-2">
      <div className="flex items-center justify-between mb-2"><span className="text-[11.5px] font-semibold">Put yourself forward</span><button onClick={() => setOpen(false)} className="w-6 h-6 rounded grid place-items-center hover:bg-surface"><X size={14} /></button></div>
      <label className="block text-[10.5px] text-text-3 mb-1">Your manifesto — why residents should pick you</label>
      <textarea value={statement} onChange={(e) => setStatement(e.target.value)} className="w-full rounded-lg border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary p-2" style={{ height: 60, resize: 'none', fontFamily: 'inherit' }} placeholder="e.g. I’ll champion greener common areas and transparent welfare spending." autoFocus />
      <button disabled={pending || !statement.trim()} onClick={() => onStand(statement)} className="w-full h-9 mt-2 rounded-lg bg-primary text-white text-[12.5px] font-medium disabled:opacity-50">{pending ? 'Submitting…' : 'Submit my nomination'}</button>
    </div>
  );
}

function ProxyPicker({ pending, onAssign }: { motionId: string; pending: boolean; onAssign: (holder: string, dir: VoteChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [holder, setHolder] = useState(PROXY_HOLDERS[0]);
  const [dir, setDir] = useState<VoteChoice>('for');
  if (!open) return (
    <button onClick={() => setOpen(true)} className="mt-2 text-[11.5px] text-text-3 inline-flex items-center gap-1.5 hover:text-text-2"><Scale size={12} /> Can’t attend the EGM? Assign a proxy</button>
  );
  return (
    <div className="mt-2 rounded-xl border border-border p-2.5 bg-surface-2">
      <div className="flex items-center justify-between mb-2"><span className="text-[11.5px] font-semibold">Assign your proxy</span><button onClick={() => setOpen(false)} className="w-6 h-6 rounded grid place-items-center hover:bg-surface"><X size={14} /></button></div>
      <label className="block text-[10.5px] text-text-3 mb-1">Who carries your vote</label>
      <select value={holder} onChange={(e) => setHolder(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12.5px] mb-2">{PROXY_HOLDERS.map((h) => <option key={h} value={h}>{h}</option>)}</select>
      <label className="block text-[10.5px] text-text-3 mb-1">Instruct them to vote</label>
      <div className="flex gap-1.5 mb-2.5">
        {(['for', 'against', 'abstain'] as VoteChoice[]).map((d) => (
          <button key={d} onClick={() => setDir(d)} className="flex-1 text-[11.5px] h-8 rounded-lg font-medium capitalize border" style={{ borderColor: dir === d ? toneVar(d === 'for' ? 'success' : d === 'against' ? 'danger' : 'muted') : 'var(--border-2)', background: dir === d ? `color-mix(in srgb, ${toneVar(d === 'for' ? 'success' : d === 'against' ? 'danger' : 'muted')} 12%, transparent)` : 'transparent', color: dir === d ? toneVar(d === 'for' ? 'success' : d === 'against' ? 'danger' : 'muted') : 'var(--text-2)' }}>{d}</button>
        ))}
      </div>
      <button disabled={pending} onClick={() => onAssign(holder, dir)} className="w-full h-9 rounded-lg bg-primary text-white text-[12.5px] font-medium disabled:opacity-50">{pending ? 'Assigning…' : 'Assign proxy'}</button>
    </div>
  );
}
