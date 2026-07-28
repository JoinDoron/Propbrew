'use client';

import { useMemo, useState, useTransition } from 'react';
import { TrendingUp, Wallet, CalendarClock, X, Sparkles, Check, Clock, PiggyBank } from 'lucide-react';
import type { InvestorProject } from '@/domain/entities';
import { forecastProject } from '@/domain/investors';
import { holdingOf, constructionProgress, paymentSchedule, handoverCountdown } from '@/domain/investor-portal';
import { NOW_MS } from '@/domain/ppm';
import { toneVar, type Tone } from '@/lib/status-tones';

const STATUS_TONE: Record<InvestorProject['status'], Tone> = { planning: 'neutral', selling: 'info', construction: 'warn', completed: 'success' };
const PAY_TONE: Record<string, Tone> = { paid: 'success', due: 'warn', upcoming: 'neutral' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function naira(minor: number): string {
  const n = minor / 100;
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n)}`;
}
function monthLabel(iso: string): string { const [y, m] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }

export function InvestorPortfolioWorkspace({ projects }: { projects: InvestorProject[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const holdings = useMemo(() => projects.map((p) => ({ p, h: holdingOf(p) })), [projects]);

  const invested = holdings.reduce((n, x) => n + x.h.investedMinor, 0);
  const projected = holdings.reduce((n, x) => n + x.h.projectedValueMinor, 0);
  const unitsHeld = holdings.reduce((n, x) => n + x.h.unitsHeld, 0);
  const blendedRoi = invested ? Math.round(((projected - invested) / invested) * 100) : 0;
  const nextHandover = [...projects].sort((a, b) => (a.handoverDate < b.handoverDate ? -1 : 1))[0];
  const open = projects.find((p) => p.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Invested" value={naira(invested)} note={`${unitsHeld} units · ${projects.length} projects`} tone="info" icon={<Wallet size={17} />} />
        <Kpi label="Projected value" value={naira(projected)} note="at handover · estimate" tone="success" icon={<TrendingUp size={17} />} />
        <Kpi label="Projected ROI" value={`${blendedRoi}%`} note="blended · estimate" tone="progress" icon={<PiggyBank size={17} />} />
        <Kpi label="Next handover" value={nextHandover ? handoverCountdown(nextHandover.handoverDate, NOW_MS).label : '—'} note={nextHandover ? nextHandover.name.split(' (')[0] : ''} tone="warn" icon={<CalendarClock size={17} />} />
      </div>

      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3">
        {holdings.map(({ p, h }) => {
          const cp = constructionProgress(p);
          return (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left bg-surface border border-border rounded-2xl shadow-card p-4 hover:border-primary/40 hover:shadow-float transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="text-[15px] font-semibold truncate">{p.name.split(' (')[0]}</h3><p className="text-[12px] text-text-3">{p.location}</p></div>
                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full capitalize flex-none" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[p.status])} 14%, transparent)`, color: toneVar(STATUS_TONE[p.status]) }}>{p.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Mini label="Your units" value={String(h.unitsHeld)} />
                <Mini label="Invested" value={naira(h.investedMinor)} />
                <Mini label="Proj. value" value={naira(h.projectedValueMinor)} />
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-2">Construction</span><span className="font-mono text-text-3">{cp.pct}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${cp.pct}%` }} /></div>
              </div>
              <div className="text-[10.5px] text-text-3 mt-2 flex items-center gap-1"><CalendarClock size={11} /> Handover in {handoverCountdown(p.handoverDate, NOW_MS).label} · tap for detail</div>
            </button>
          );
        })}
      </div>

      {open && <ProjectDrawer project={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ProjectDrawer({ project: p, onClose }: { project: InvestorProject; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [paidToast, setPaidToast] = useState<string | null>(null);
  const h = holdingOf(p);
  const cp = constructionProgress(p);
  const f = forecastProject(p);
  const sched = paymentSchedule(p, h);
  const hc = handoverCountdown(p.handoverDate, NOW_MS);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[520px] h-full bg-surface border-l border-border shadow-float overflow-y-auto animate-[tms-slidein_.22s_ease]">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-4 py-3 flex items-start justify-between">
          <div><h2 className="text-[16px] font-semibold">{p.name.split(' (')[0]}</h2><p className="text-[12px] text-text-3">{p.location} · handover {monthLabel(p.handoverDate.slice(0, 7) + '-01')}</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Your holding */}
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary mb-2.5"><Wallet size={13} /> Your holding</div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Units" value={String(h.unitsHeld)} unit={`${h.ownershipPct}% of project`} />
              <Stat label="Invested" value={naira(h.investedMinor)} unit={`${naira(h.unitPriceMinor)}/unit`} />
              <Stat label="Projected value" value={naira(h.projectedValueMinor)} unit={`+${naira(h.gainMinor)} · ${h.roiPct}%`} />
            </div>
            <p className="text-[10.5px] text-text-3 mt-2.5">Projected value applies the project’s estimated ROI to your stake at handover. Estimate on demo assumptions — not financial advice.</p>
          </div>

          {/* Construction */}
          <Section title="Construction progress" hint={`${cp.pct}% · handover in ${hc.label}`}>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden mb-3"><div className="h-full rounded-full bg-primary" style={{ width: `${cp.pct}%` }} /></div>
            <div className="flex items-center">
              {cp.milestones.map((m, i) => (
                <div key={m.key} className="flex-1 flex items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`w-5 h-5 rounded-full grid place-items-center flex-none ${m.state === 'done' ? 'bg-success text-white' : m.state === 'current' ? 'bg-primary text-white animate-[tms-pulse_1.6s_ease-in-out_infinite]' : 'bg-surface-3 text-text-3'}`}>{m.state === 'done' ? <Check size={11} /> : m.state === 'current' ? <Clock size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}</span>
                    <span className={`text-[8.5px] text-center leading-tight ${m.state === 'current' ? 'text-primary font-semibold' : 'text-text-3'}`}>{m.label}</span>
                  </div>
                  {i < cp.milestones.length - 1 && <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: m.state === 'done' ? toneVar('success') : 'var(--surface-3)' }} />}
                </div>
              ))}
            </div>
          </Section>

          {/* Sell-out forecast */}
          <Section title="Project sales" hint="estimate">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Sold" value={`${f.pctSold}%`} unit={`${p.unitsSold}/${p.unitsTotal}`} />
              <Stat label="Sales pace" value={`${f.monthlyPace}`} unit="units/mo" />
              <Stat label="Sell-out" value={f.selloutISO ? monthLabel(f.selloutISO) : 'Sold out'} unit={f.monthsToSellout ? `~${f.monthsToSellout} mo` : ''} />
            </div>
            <p className="text-[10.5px] text-text-3 mt-2 flex items-center gap-1"><Sparkles size={10} /> A fast-selling project supports your resale value — indicative only.</p>
          </Section>

          {/* Payment schedule */}
          <Section title="Your payment plan" hint={naira(h.investedMinor)}>
            <div className="flex flex-col gap-1.5">
              {sched.map((s) => (
                <div key={s.label} className="flex items-center gap-2.5 py-1.5">
                  <span className="w-6 h-6 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(PAY_TONE[s.status])} 14%, transparent)`, color: toneVar(PAY_TONE[s.status]) }}>{s.status === 'paid' ? <Check size={13} /> : <Clock size={13} />}</span>
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{s.label} <span className="text-text-3 font-normal">· {s.pctOfPlan}%</span></div><div className="text-[10.5px] text-text-3">due {monthLabel(s.dueISO)}</div></div>
                  <span className="text-[12.5px] font-mono font-semibold flex-none">{naira(s.amountMinor)}</span>
                  {s.status === 'due' && <button disabled={pending} onClick={() => start(() => { setPaidToast(`Payment of ${naira(s.amountMinor)} recorded (demo).`); setTimeout(() => setPaidToast(null), 3000); })} className="text-[11px] px-2.5 h-7 rounded-lg bg-primary text-white font-medium flex-none disabled:opacity-50">Pay</button>}
                </div>
              ))}
            </div>
          </Section>
        </div>
        {paidToast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{paidToast}</div>}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div><div className="flex items-center justify-between mb-2"><h3 className="text-[12.5px] font-semibold">{title}</h3>{hint && <span className="text-[10.5px] text-text-3">{hint}</span>}</div>{children}</div>;
}
function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div><div className="text-[10.5px] text-text-3">{label}</div><div className="text-[15px] font-bold tracking-[-0.01em] leading-tight mt-0.5">{value}</div><div className="text-[10px] text-text-3">{unit}</div></div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] text-text-3 uppercase tracking-[0.04em]">{label}</div><div className="text-[13px] font-semibold mt-0.5">{value}</div></div>;
}
function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div>
      <div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[10.5px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
