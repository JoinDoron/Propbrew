'use client';

import Link from 'next/link';
import { Eye, Camera, Flag, CalendarClock, Building2, ShieldCheck, TrendingUp } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type WatchProject = {
  id: string; name: string; location: string; code: string;
  percentComplete: number; plannedPercent: number;
  confidence: { score: number; band: Tone; label: string; drivers: { label: string; value: string; tone: Tone }[] };
  handoverISO: string; forecastFinishISO: string; slipDays: number;
  levels: { level: number; label: string; progress: number; band: Tone }[];
  milestones: { name: string; dueISO: string; status: string; band: Tone }[];
  updates: { dateISO: string; text: string; photos: number }[];
  unitsSold?: number; unitsTotal?: number;
  investorHref?: string;
};

export function BuildWatch({ projects, showCommercials }: { projects: WatchProject[]; showCommercials: boolean }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0c1408 0%,#182a10 55%,#26401a 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Eye size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">BUILD WATCH · CLIENT VIEW</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">Watch your building go up</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">Progress, confidence and handover outlook — the same records the site team works from{showCommercials ? '' : ', with commercial detail withheld'}</div>
          </div>
        </div>
      </div>

      {projects.map((p) => (
        <section key={p.id} className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-border flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold flex items-center gap-1.5 flex-wrap">{p.name} <span className="text-[10.5px] text-text-3 font-mono font-normal">{p.code}</span></div>
              <div className="text-[11.5px] text-text-3 flex items-center gap-1"><Building2 size={11} /> {p.location}</div>
              {p.unitsTotal ? <div className="text-[11px] text-text-3 mt-0.5">{p.unitsSold}/{p.unitsTotal} units sold{p.investorHref ? ' · ' : ''}{p.investorHref && <Link href={p.investorHref} className="text-primary">sales portfolio →</Link>}</div> : null}
            </div>
            <ConfidenceRing c={p.confidence} />
          </div>

          {/* Progress */}
          <div className="px-4 py-3">
            <div className="flex justify-between text-[11.5px] mb-1"><span className="text-text-3">Construction progress</span><span className="font-mono font-semibold">{p.percentComplete}%</span></div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden relative">
              <div className="h-full rounded-full" style={{ width: `${p.percentComplete}%`, background: toneVar(p.percentComplete >= p.plannedPercent ? 'success' : 'warn') }} />
              <span className="absolute top-[-3px] bottom-[-3px] w-px bg-text" style={{ left: `${p.plannedPercent}%` }} title="planned to date" />
            </div>
            <div className="text-[10.5px] text-text-3 mt-1">Planned {p.plannedPercent}% by today</div>
          </div>

          {/* Confidence drivers */}
          <div className="px-4 pb-3 grid grid-cols-2 min-[560px]:grid-cols-4 gap-2.5">
            {p.confidence.drivers.map((d) => (
              <div key={d.label} className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="text-[10px] text-text-3 uppercase tracking-wide">{d.label}</div>
                <div className="text-[12.5px] font-semibold mt-0.5" style={{ color: toneVar(d.tone) }}>{d.value}</div>
              </div>
            ))}
          </div>

          {/* Handover */}
          <div className="px-4 py-3 border-t border-border flex items-center gap-2 flex-wrap text-[12px]">
            <CalendarClock size={13} className="text-text-3" />
            <span className="text-text-3">Handover</span>
            <span className="font-mono font-semibold">{p.handoverISO}</span>
            {p.slipDays > 0
              ? <span className="text-[11px] px-2 h-6 inline-flex items-center rounded-full font-medium" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 13%, transparent)`, color: toneVar('warn') }}>tracking {p.slipDays} days late — recovery under review</span>
              : <span className="text-[11px] px-2 h-6 inline-flex items-center rounded-full font-medium" style={{ background: `color-mix(in srgb, ${toneVar('success')} 13%, transparent)`, color: toneVar('success') }}>on programme</span>}
          </div>

          {/* Floors */}
          {p.levels.length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-2">Floor by floor</div>
              <div className="flex flex-col-reverse gap-1">
                {p.levels.map((l) => (
                  <div key={l.level} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-text-3 w-6 flex-none">L{l.level}</span>
                    <div className="flex-1 h-5 rounded-md bg-surface-2 overflow-hidden relative">
                      <div className="h-full rounded-md" style={{ width: `${l.progress}%`, background: `color-mix(in srgb, ${toneVar(l.band)} 55%, transparent)` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-[10.5px]">{l.label}</span>
                    </div>
                    <span className="text-[10.5px] font-mono text-text-3 w-9 text-right flex-none">{l.progress}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Milestones */}
          {p.milestones.length > 0 && (
            <div className="px-4 py-3 border-t border-border flex flex-wrap gap-1.5">
              {p.milestones.map((m) => (
                <span key={m.name} className="text-[10.5px] px-2 h-6 inline-flex items-center gap-1 rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(m.band)} 12%, transparent)`, color: toneVar(m.band) }}><Flag size={9} /> {m.name} · {m.dueISO}</span>
              ))}
            </div>
          )}

          {/* Site updates */}
          {p.updates.length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-2">From site</div>
              <div className="flex flex-col gap-2">
                {p.updates.map((u) => (
                  <div key={u.dateISO} className="flex items-start gap-2.5">
                    <span className="text-[10.5px] font-mono text-text-3 flex-none w-16 mt-0.5">{u.dateISO.slice(5)}</span>
                    <div className="min-w-0 flex-1 text-[12px] text-text-2">{u.text}</div>
                    {u.photos > 0 && <span className="text-[10.5px] text-text-3 inline-flex items-center gap-1 flex-none"><Camera size={10} /> {u.photos}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-start gap-2.5">
        <ShieldCheck size={16} className="mt-0.5 flex-none" style={{ color: toneVar('success') }} />
        <div className="text-[11.5px] text-text-3">
          Every figure here is computed from approved site records and the project cost ledger — the same source the delivery team uses. Confidence blends schedule, cost, reporting discipline and safety; it is an estimate of delivery risk, not a guarantee{showCommercials ? '' : '. Vendor pricing, bid detail and labour rates are not shown at your access level'}.
        </div>
      </div>
    </div>
  );
}

function ConfidenceRing({ c }: { c: WatchProject['confidence'] }) {
  const color = toneVar(c.band);
  return (
    <div className="flex items-center gap-2.5 flex-none">
      <div className="relative" style={{ width: 60, height: 60 }}>
        <svg width={60} height={60} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(c.score / 100) * 97.4} 97.4`} /></svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-[14px] font-bold" style={{ color }}>{c.score}</span></div>
      </div>
      <div>
        <div className="text-[12px] font-semibold" style={{ color }}>{c.label}</div>
        <div className="text-[10px] text-text-3 inline-flex items-center gap-1"><TrendingUp size={9} /> build confidence</div>
      </div>
    </div>
  );
}
