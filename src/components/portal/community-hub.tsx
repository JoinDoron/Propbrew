'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vote, PartyPopper, Award, ThumbsUp, ThumbsDown, MinusCircle, Check, Star, Gift, CalendarDays, MapPin } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';
import { motionTally, tierFor, tierProgress, TIER_TONE, eventFillPct, isEventFull, type VoteChoice, type MotionStatus, type RewardTier, type EventCategory } from '@/domain/estate';
import { residentVote, residentRsvp, residentRedeem } from '@/server/actions/resident-community';

export type PMotion = { id: string; ref: string; title: string; summary: string; status: MotionStatus; forWeight: number; againstWeight: number; abstainWeight: number; eligibleWeight: number; quorumPct: number; thresholdPct: number; closesISO: string; myChoice?: VoteChoice };
export type PEvent = { id: string; title: string; category: EventCategory; venue: string; startISO: string; capacity: number; rsvps: number };
export type MyRewards = { points: number; onTimeStreak: number; eventsAttended: number; pollsVoted: number; rank: number; total: number } | null;
export type PPerk = { id: string; title: string; detail: string; cost: number; stock: number };

const TIER_LABEL: Record<RewardTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
const CHOICE_LABEL: Record<VoteChoice, string> = { for: 'For', against: 'Against', abstain: 'Abstain' };
const pts = (n: number) => n.toLocaleString('en-NG');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });

export function CommunityHub({ firstName, motions, events, rewards, perks }: {
  firstName: string; motions: PMotion[]; events: PEvent[]; rewards: MyRewards; perks: PPerk[];
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
                <div className="text-[10.5px] text-text-3 mt-1">{t.turnoutPct}% turnout {t.quorumMet ? '· quorate' : `· needs ${m.quorumPct}%`} · {t.approvalPct}% in favour · closes {day(m.closesISO)}</div>
                {m.myChoice ? (
                  <div className="mt-2 text-[12px] font-medium inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg" style={{ background: `color-mix(in srgb, ${toneVar('success')} 12%, transparent)`, color: toneVar('success') }}><Check size={13} /> You voted {CHOICE_LABEL[m.myChoice]}</div>
                ) : (
                  <div className="flex gap-1.5 mt-2">
                    <button disabled={pending} onClick={() => act(() => residentVote(m.id, 'for'), 'Your vote is in · For')} className="flex-1 text-[12px] px-2.5 h-9 rounded-lg font-medium inline-flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: `color-mix(in srgb, ${toneVar('success')} 12%, transparent)`, color: toneVar('success') }}><ThumbsUp size={13} /> For</button>
                    <button disabled={pending} onClick={() => act(() => residentVote(m.id, 'against'), 'Your vote is in · Against')} className="flex-1 text-[12px] px-2.5 h-9 rounded-lg font-medium inline-flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 12%, transparent)`, color: toneVar('danger') }}><ThumbsDown size={13} /> Against</button>
                    <button disabled={pending} onClick={() => act(() => residentVote(m.id, 'abstain'), 'Your vote is in · Abstain')} className="text-[12px] px-2.5 h-9 rounded-lg font-medium inline-flex items-center justify-center gap-1 border border-border-2 disabled:opacity-50"><MinusCircle size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
          {openMotions.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No open votes right now.</div>}
        </div>
      </section>

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
