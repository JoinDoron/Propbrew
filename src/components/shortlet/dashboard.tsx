import Link from 'next/link';
import { TrendingUp, Percent, CalendarCheck, Wallet, PlaneLanding, PlaneTakeoff, BedDouble, Sparkles, AlertTriangle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type Kpi = { revenueMinor: number; profitMinor: number; occupancyPct: number; bookings: number; cautionHeldMinor: number };
export type Move = { ref: string; guest: string; apt: string; source: string };
export type CalRow = { apt: string; property: string; cells: ({ guest: string; tone: Tone; span: number } | null)[] };
export type MonthBar = { label: string; revenueMinor: number; expenseMinor: number; profitMinor: number };
export type Attn = { kind: 'inspect' | 'turnover' | 'balance' | 'enquiry'; title: string; sub: string; href: string };

function naira(minor: number): string {
  const n = minor / 100;
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n)}`;
}

const ATTN_META: Record<Attn['kind'], { icon: React.ReactNode; tone: Tone }> = {
  inspect: { icon: <ShieldCheck size={15} />, tone: 'warn' },
  turnover: { icon: <AlertTriangle size={15} />, tone: 'danger' },
  balance: { icon: <Wallet size={15} />, tone: 'progress' },
  enquiry: { icon: <Sparkles size={15} />, tone: 'info' },
};

export function ShortletDashboard({ kpis, monthLabel, arrivals, departures, staying, calendar, days, revExp, attention }: {
  kpis: Kpi; monthLabel: string; arrivals: Move[]; departures: Move[]; staying: Move[];
  calendar: CalRow[]; days: string[]; revExp: MonthBar[]; attention: Attn[];
}) {
  const maxBar = Math.max(...revExp.map((m) => Math.max(m.revenueMinor, m.expenseMinor)), 1);
  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero KPI band */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 55%, #0ea5e9 100%)' }}>
        <div className="absolute -right-8 -top-10 w-48 h-48 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #fff, transparent 70%)' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[12px] text-white/70">{monthLabel} · portfolio</div>
            <div className="text-[34px] font-bold tracking-[-0.03em] leading-none mt-1">{naira(kpis.revenueMinor)}</div>
            <div className="text-[12.5px] text-white/80 mt-1">revenue · <span className="font-semibold">{naira(kpis.profitMinor)} profit</span></div>
          </div>
          <div className="flex gap-5">
            <HeroStat icon={<Percent size={16} />} label="Occupied" value={`${kpis.occupancyPct}%`} />
            <HeroStat icon={<CalendarCheck size={16} />} label="Bookings" value={String(kpis.bookings)} />
            <HeroStat icon={<Wallet size={16} />} label="Caution held" value={naira(kpis.cautionHeldMinor)} />
          </div>
        </div>
      </div>

      {/* Today's movements */}
      <div className="grid grid-cols-1 min-[720px]:grid-cols-3 gap-3">
        <MoveCard icon={<PlaneLanding size={16} />} tone="info" title="Arrivals today" moves={arrivals} empty="No check-ins today" />
        <MoveCard icon={<PlaneTakeoff size={16} />} tone="warn" title="Departures today" moves={departures} empty="No check-outs today" />
        <MoveCard icon={<BedDouble size={16} />} tone="success" title="In-house now" moves={staying} empty="No guests in-house" />
      </div>

      <div className="grid grid-cols-1 min-[960px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Occupancy strip */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <CalendarCheck size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Next 7 nights</span>
            <Link href="/shortlet/calendar" className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5">Full calendar <ArrowUpRight size={12} /></Link>
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid items-center mb-1.5" style={{ gridTemplateColumns: `120px repeat(${days.length}, 1fr)` }}>
                <span />
                {days.map((d) => <span key={d} className="text-[10px] text-text-3 text-center">{d}</span>)}
              </div>
              {calendar.map((row) => (
                <div key={row.apt} className="grid items-center h-8" style={{ gridTemplateColumns: `120px repeat(${days.length}, 1fr)` }}>
                  <div className="min-w-0 pr-2"><div className="text-[11.5px] font-medium truncate">{row.apt}</div><div className="text-[9.5px] text-text-3 truncate">{row.property}</div></div>
                  {renderCells(row.cells)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Needs attention */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Sparkles size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Needs attention</span></div>
          {attention.length === 0 ? (
            <p className="text-[12.5px] text-text-3 px-4 py-4">All caught up.</p>
          ) : (
            <div className="divide-y divide-border">
              {attention.map((a, i) => {
                const m = ATTN_META[a.kind];
                return (
                  <Link key={i} href={a.href} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2 transition-colors">
                    <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(m.tone)} 14%, transparent)`, color: toneVar(m.tone) }}>{m.icon}</span>
                    <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{a.title}</div><div className="text-[11px] text-text-3 truncate">{a.sub}</div></div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revenue vs expense */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-3"><TrendingUp size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Revenue vs expenses</span><Link href="/shortlet/analytics" className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5">Analytics <ArrowUpRight size={12} /></Link></div>
        <div className="flex items-end justify-between gap-2 h-32">
          {revExp.map((m) => (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full flex items-end justify-center gap-1 h-full">
                <div className="w-1/2 rounded-t" style={{ height: `${(m.revenueMinor / maxBar) * 100}%`, background: toneVar('success'), minHeight: 2 }} title={`Revenue ${naira(m.revenueMinor)}`} />
                <div className="w-1/2 rounded-t" style={{ height: `${(m.expenseMinor / maxBar) * 100}%`, background: toneVar('danger'), minHeight: 2 }} title={`Expense ${naira(m.expenseMinor)}`} />
              </div>
              <span className="text-[10px] text-text-3">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-2 text-[10.5px] text-text-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar('success') }} /> Revenue</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar('danger') }} /> Expenses</span>
        </div>
      </div>
    </div>
  );
}

function renderCells(cells: CalRow['cells']) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === null) { out.push(<div key={i} className="h-6 mx-0.5 rounded bg-surface-2" />); continue; }
    out.push(
      <div key={i} className="h-6 mx-0.5 rounded px-1.5 flex items-center overflow-hidden" style={{ gridColumn: `span ${c.span}`, background: `color-mix(in srgb, ${toneVar(c.tone)} 22%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(c.tone)} 45%, transparent)` }}>
        <span className="text-[9.5px] font-medium truncate" style={{ color: toneVar(c.tone) }}>{c.guest}</span>
      </div>,
    );
    i += c.span - 1;
  }
  return out;
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1 text-white/70 text-[11px]">{icon}{label}</div>
      <div className="text-[19px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
    </div>
  );
}

function MoveCard({ icon, tone, title, moves, empty }: { icon: React.ReactNode; tone: Tone; title: string; moves: Move[]; empty: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><span className="text-[12.5px] font-semibold">{title}</span><span className="ml-auto text-[13px] font-bold">{moves.length}</span></div>
      {moves.length === 0 ? <p className="text-[11.5px] text-text-3">{empty}</p> : (
        <div className="flex flex-col gap-1.5">
          {moves.slice(0, 4).map((m) => (
            <div key={m.ref} className="flex items-center gap-2 text-[12px]"><span className="font-medium truncate flex-1">{m.guest}</span><span className="text-text-3 text-[11px]">{m.apt}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
