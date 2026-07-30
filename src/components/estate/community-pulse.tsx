'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Smile, Frown, Meh, Users, MessageCircle, TriangleAlert, Building2, Check, UserMinus, Radio, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import type { Sentiment } from '@/domain/estate';
import { acknowledgeFeedback, resolveComplaint } from '@/server/actions/estate';

export type Health = { score: number; band: Tone; label: string };
export type FeedbackRow = { id: string; residentName: string; unitLabel: string; channel: string; sentiment: Sentiment; topic: string; text: string; atISO: string; acknowledged: boolean };
export type ComplaintRow = { id: string; building: string; category: string; severity: string; status: string; atISO: string };
export type Hotspot = { building: string; open: number; high: number };
export type AtRisk = { name: string; unitLabel: string; score: number; band: Tone; note: string };
export type Engagement = { appAdoptionPct: number; eventAttendancePct: number; pollParticipationPct: number; announcementReadPct: number; activeResidents: number; totalResidents: number };

const SENT_ICON: Record<Sentiment, React.ReactNode> = { positive: <Smile size={13} />, neutral: <Meh size={13} />, negative: <Frown size={13} /> };
const SENT_TONE: Record<Sentiment, Tone> = { positive: 'success', neutral: 'neutral', negative: 'danger' };
const SEV_TONE: Record<string, Tone> = { high: 'danger', medium: 'warn', low: 'info' };

function ago(iso: string, nowMs: number) { const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000)); if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; }

export function CommunityPulse({ health, nps, sentiment, engagement, feedback, complaints, hotspots, atRisk, nowMs }: {
  health: Health; nps: number; sentiment: Record<Sentiment, number>; engagement: Engagement;
  feedback: FeedbackRow[]; complaints: ComplaintRow[]; hotspots: Hotspot[]; atRisk: AtRisk[]; nowMs: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 4000); return () => clearInterval(t); }, []);
  const clockMs = nowMs + tick * 4000;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const totalSent = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
  const openComplaints = complaints.filter((c) => c.status === 'open');
  const bars: { label: string; pct: number }[] = [
    { label: 'App adoption', pct: engagement.appAdoptionPct }, { label: 'Announcement reads', pct: engagement.announcementReadPct },
    { label: 'Event attendance', pct: engagement.eventAttendancePct }, { label: 'Poll participation', pct: engagement.pollParticipationPct },
  ];
  const shownFeedback = [...feedback].sort((a, b) => (a.acknowledged ? 1 : 0) - (b.acknowledged ? 1 : 0) || Date.parse(b.atISO) - Date.parse(a.atISO));

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#2a0f2e 0%,#3d1445 55%,#4a1d63 100%)' }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${toneVar(health.band)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring score={health.score} band={health.band} label="health" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-white/70"><Heart size={12} /> COMMUNITY PULSE · <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f0abfc] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#f0abfc]" /></span> live</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">Resident experience · <span style={{ color: toneVar(health.band) }}>{health.label}</span></div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{engagement.activeResidents}/{engagement.totalResidents} residents active · NPS <span className="font-semibold" style={{ color: nps >= 0 ? '#86efac' : '#fca5a5' }}>{nps > 0 ? '+' : ''}{nps}</span> · {openComplaints.length} open complaint{openComplaints.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="NPS" value={`${nps > 0 ? '+' : ''}${nps}`} tone={nps >= 30 ? 'success' : nps >= 0 ? 'warn' : 'danger'} icon={<Sparkles size={16} />} />
        <Kpi label="App adoption" value={`${engagement.appAdoptionPct}%`} tone={engagement.appAdoptionPct >= 70 ? 'success' : 'warn'} icon={<Users size={16} />} />
        <Kpi label="Open complaints" value={String(openComplaints.length)} tone={openComplaints.length ? 'warn' : 'success'} icon={<MessageCircle size={16} />} />
        <Kpi label="Move-out risk" value={String(atRisk.filter((r) => r.band === 'danger').length)} tone={atRisk.some((r) => r.band === 'danger') ? 'danger' : 'success'} icon={<UserMinus size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-3.5">
        {/* Sentiment + engagement */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-2.5">Sentiment · {totalSent} signals</div>
          <div className="flex h-3 rounded-full overflow-hidden mb-1.5">
            {(['positive', 'neutral', 'negative'] as Sentiment[]).map((s) => sentiment[s] > 0 && <div key={s} style={{ width: `${(sentiment[s] / totalSent) * 100}%`, background: toneVar(SENT_TONE[s]) }} />)}
          </div>
          <div className="flex gap-3 text-[11px] text-text-3 mb-3.5">
            {(['positive', 'neutral', 'negative'] as Sentiment[]).map((s) => <span key={s} className="inline-flex items-center gap-1 capitalize"><span className="w-2 h-2 rounded-full" style={{ background: toneVar(SENT_TONE[s]) }} />{s} {sentiment[s]}</span>)}
          </div>
          <div className="text-[12.5px] font-semibold mb-2">Engagement</div>
          <div className="flex flex-col gap-2">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-[11px] mb-0.5"><span className="text-text-2">{b.label}</span><span className="font-mono text-text-3">{b.pct}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: toneVar(b.pct >= 70 ? 'success' : b.pct >= 45 ? 'info' : 'warn') }} /></div>
              </div>
            ))}
          </div>
        </section>

        {/* Hotspots + at-risk */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3.5">
          <div>
            <div className="text-[12.5px] font-semibold mb-2 flex items-center gap-1.5"><Building2 size={14} className="text-text-3" /> Complaint hotspots</div>
            {hotspots.length === 0 ? <p className="text-[12px] text-text-3">No open complaints — all quiet.</p> : (
              <div className="flex flex-col gap-1.5">
                {hotspots.map((h) => (
                  <div key={h.building} className="flex items-center gap-2">
                    <span className="text-[12px] font-medium w-20 flex-none">{h.building}</span>
                    <div className="flex-1 h-4 rounded bg-surface-2 overflow-hidden relative"><div className="h-full rounded" style={{ width: `${Math.min(100, h.open * 22)}%`, background: toneVar(h.high ? 'danger' : 'warn') }} /></div>
                    <span className="text-[11px] text-text-3 flex-none w-24 text-right">{h.open} open{h.high ? ` · ${h.high} high` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-[12.5px] font-semibold mb-2 flex items-center gap-1.5"><UserMinus size={14} className="text-text-3" /> Move-out risk <span className="text-[10.5px] text-text-3 font-normal">· AI-scored</span></div>
            <div className="flex flex-col gap-1.5">
              {atRisk.slice(0, 5).map((r) => (
                <div key={r.name} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><div className="text-[12px] font-medium truncate">{r.name}</div><div className="text-[10px] text-text-3 truncate">{r.unitLabel} · {r.note}</div></div>
                  <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(r.band)} 14%, transparent)`, color: toneVar(r.band) }}>{r.score}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Feedback feed */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><MessageCircle size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Resident voice</span><Radio size={11} className="text-text-3 animate-pulse ml-auto" /></div>
          <div className="divide-y divide-border max-h-[440px] overflow-y-auto">
            {shownFeedback.map((f) => (
              <div key={f.id} className={`px-4 py-3 ${f.acknowledged ? 'opacity-55' : ''}`}>
                <div className="flex items-start gap-2.5">
                  <span className="w-7 h-7 rounded-lg grid place-items-center flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar(SENT_TONE[f.sentiment])} 14%, transparent)`, color: toneVar(SENT_TONE[f.sentiment]) }}>{SENT_ICON[f.sentiment]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px]">{f.text}</div>
                    <div className="text-[10.5px] text-text-3 mt-0.5">{f.residentName} · {f.unitLabel} · {f.topic} · {f.channel} · {ago(f.atISO, clockMs)}</div>
                  </div>
                  {!f.acknowledged && <button disabled={pending} onClick={() => act(() => acknowledgeFeedback(f.id), 'Acknowledged')} className="text-[11px] px-2 h-7 rounded-lg border border-border-2 inline-flex items-center gap-1 flex-none disabled:opacity-50"><Check size={12} /> Ack</button>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Complaints */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><TriangleAlert size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Complaints</span><span className="ml-auto text-[11px]" style={{ color: toneVar(openComplaints.length ? 'warn' : 'success') }}>{openComplaints.length} open</span></div>
          <div className="divide-y divide-border">
            {complaints.map((c) => (
              <div key={c.id} className={`px-4 py-2.5 flex items-center gap-2 ${c.status === 'resolved' ? 'opacity-55' : ''}`}>
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: toneVar(SEV_TONE[c.severity]) }} />
                <div className="min-w-0 flex-1"><div className="text-[12px] font-medium truncate">{c.category}</div><div className="text-[10px] text-text-3">{c.building} · {ago(c.atISO, clockMs)}</div></div>
                {c.status === 'open' ? <button disabled={pending} onClick={() => act(() => resolveComplaint(c.id), 'Complaint resolved')} className="text-[10.5px] px-2 h-6 rounded-lg border border-border-2 flex-none disabled:opacity-50">Resolve</button> : <span className="text-[10px] text-positive flex-none">resolved</span>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Ring({ score, band, label }: { score: number; band: Tone; label: string }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span><span className="text-[8px] text-white/60 uppercase tracking-wide">{label}</span></div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
