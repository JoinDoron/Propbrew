'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Trophy, Star, Gift, Crown, Flame, CalendarCheck, Vote, Coins } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { tierFor, tierProgress, TIER_TONE, TIER_MIN, type RewardTier, type EarnReason } from '@/domain/estate';
import { awardPoints, redeemPerk } from '@/server/actions/estate';

export type MemberRow = { id: string; residentName: string; unitLabel: string; points: number; onTimeStreak: number; eventsAttended: number; pollsVoted: number };
export type PerkRow = { id: string; title: string; detail: string; cost: number; category: string; stock: number };

const TIER_LABEL: Record<RewardTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
const pts = (n: number) => n.toLocaleString('en-NG');

export function RewardsWorkspace({ members, perks, kpis }: {
  members: MemberRow[]; perks: PerkRow[];
  kpis: { members: number; pointsIssued: number; goldPlus: number; perks: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ranked = [...members].sort((a, b) => b.points - a.points);
  const [selected, setSelected] = useState<string>(ranked[0]?.id ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });
  const sel = members.find((m) => m.id === selected);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#2a1e05 0%,#4a3410 55%,#6b4d18 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Award size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><Star size={12} /> ESTATE REWARDS</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{pts(kpis.pointsIssued)} points in circulation</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{kpis.members} members earning on on-time payments, events & votes</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Members" value={String(kpis.members)} tone="info" icon={<Star size={16} />} />
        <Kpi label="Points issued" value={pts(kpis.pointsIssued)} tone="progress" icon={<Coins size={16} />} />
        <Kpi label="Gold & above" value={String(kpis.goldPlus)} tone="warn" icon={<Crown size={16} />} />
        <Kpi label="Perks" value={String(kpis.perks)} tone="success" icon={<Gift size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-3.5 items-start">
        {/* Leaderboard / members */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Trophy size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Leaderboard</span><span className="ml-auto text-[10.5px] text-text-3">tap a member, then redeem a perk</span></div>
          <div className="divide-y divide-border">
            {ranked.map((m, i) => {
              const tier = tierFor(m.points); const prog = tierProgress(m.points);
              const isSel = m.id === selected;
              return (
                <button key={m.id} onClick={() => setSelected(m.id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 ${isSel ? 'bg-surface-2' : 'hover:bg-surface-2'}`}>
                  <span className="w-6 text-center text-[13px] font-bold flex-none" style={{ color: i < 3 ? toneVar('warn') : 'var(--text-3)' }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold flex items-center gap-1.5 truncate">{m.residentName}
                      <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(TIER_TONE[tier])} 16%, transparent)`, color: toneVar(TIER_TONE[tier]) }}>{TIER_LABEL[tier]}</span>
                    </div>
                    <div className="text-[10.5px] text-text-3 flex items-center gap-2">{m.unitLabel} · <Flame size={10} className="inline" />{m.onTimeStreak}mo · <CalendarCheck size={10} className="inline" />{m.eventsAttended} · <Vote size={10} className="inline" />{m.pollsVoted}</div>
                    {prog.next && <div className="mt-1 h-1 rounded-full bg-surface-2 overflow-hidden max-w-[220px]"><div className="h-full rounded-full" style={{ width: `${prog.pct}%`, background: toneVar(TIER_TONE[tier]) }} /></div>}
                  </div>
                  <div className="text-right flex-none"><div className="text-[14px] font-bold tracking-[-0.02em] leading-none">{pts(m.points)}</div><div className="text-[9.5px] text-text-3">{prog.next ? `${pts(prog.toNext)} to ${TIER_LABEL[prog.next]}` : 'max tier'}</div></div>
                </button>
              );
            })}
          </div>
          {sel && (
            <div className="px-4 py-2.5 border-t border-border bg-surface-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11.5px] text-text-2">Award <span className="font-semibold">{sel.residentName}</span>:</span>
              <button disabled={pending} onClick={() => act(() => awardPoints(sel.id, 'on_time_payment' as EarnReason), 'On-time payment · +100')} className="text-[11px] px-2.5 h-7 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><CalendarCheck size={11} /> On-time pay +100</button>
              <button disabled={pending} onClick={() => act(() => awardPoints(sel.id, 'event' as EarnReason), 'Event attended · +50')} className="text-[11px] px-2.5 h-7 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><CalendarCheck size={11} /> Event +50</button>
              <button disabled={pending} onClick={() => act(() => awardPoints(sel.id, 'poll' as EarnReason), 'Vote cast · +30')} className="text-[11px] px-2.5 h-7 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Vote size={11} /> Vote +30</button>
            </div>
          )}
        </section>

        {/* Perks */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Gift size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Perks catalog</span></div>
          <div className="divide-y divide-border">
            {perks.map((p) => {
              const affordable = !!sel && sel.points >= p.cost && p.stock > 0;
              return (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-[12.5px] font-semibold">{p.title}</div><div className="text-[10.5px] text-text-3">{p.detail}</div></div>
                    <span className="text-[11px] font-bold flex-none" style={{ color: toneVar('warn') }}>{pts(p.cost)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-text-3">{p.category} · {p.stock} left</span>
                    <button disabled={pending || !affordable} onClick={() => sel && act(() => redeemPerk(sel.id, p.id), `Redeemed for ${sel.residentName}`)} className="ml-auto text-[11px] px-2.5 h-7 rounded-lg font-medium bg-primary text-white disabled:opacity-40">{p.stock === 0 ? 'Out' : 'Redeem'}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 text-[10px] text-text-3 border-t border-border">Tiers: Silver {pts(TIER_MIN.silver)} · Gold {pts(TIER_MIN.gold)} · Platinum {pts(TIER_MIN.platinum)}</div>
        </section>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
