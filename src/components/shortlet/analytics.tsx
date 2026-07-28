'use client';

import { Download, TrendingUp, Building2, Percent, Users } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';

export type MonthBar = { label: string; revenueMinor: number; expenseMinor: number };
export type PropProfit = { name: string; revenueMinor: number; expenseMinor: number; profitMinor: number; marginPct: number };
export type AptOcc = { name: string; property: string; occupancyPct: number };
export type SourcePerf = { label: string; bookings: number; revenueMinor: number; nights: number };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

export function ShortletAnalytics({ revExp, propProfit, occupancy, sources }: { revExp: MonthBar[]; propProfit: PropProfit[]; occupancy: AptOcc[]; sources: SourcePerf[] }) {
  const maxBar = Math.max(...revExp.map((m) => Math.max(m.revenueMinor, m.expenseMinor)), 1);
  const maxProfit = Math.max(...propProfit.map((p) => p.revenueMinor), 1);
  const maxSrc = Math.max(...sources.map((s) => s.revenueMinor), 1);

  function exportCsv() {
    const head = 'section,label,revenue,expense,profit,margin_pct,occupancy_pct,bookings,nights';
    const rows = [
      ...revExp.map((m) => `month,${m.label},${m.revenueMinor / 100},${m.expenseMinor / 100},,,,,`),
      ...propProfit.map((p) => `property,${p.name},${p.revenueMinor / 100},${p.expenseMinor / 100},${p.profitMinor / 100},${p.marginPct},,,`),
      ...occupancy.map((o) => `apartment,${o.name},,,,,${o.occupancyPct},,`),
      ...sources.map((s) => `source,${s.label},${s.revenueMinor / 100},,,,,${s.bookings},${s.nights}`),
    ];
    const url = URL.createObjectURL(new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'shortlet-analytics.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex justify-end"><button onClick={exportCsv} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium"><Download size={15} /> Export CSV</button></div>

      <div className="grid grid-cols-1 min-[820px]:grid-cols-2 gap-3.5">
        <Panel icon={<TrendingUp size={14} />} title="Revenue vs expenses">
          <div className="flex items-end justify-between gap-2 h-36">
            {revExp.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full flex items-end justify-center gap-1 h-full">
                  <div className="w-1/2 rounded-t" style={{ height: `${(m.revenueMinor / maxBar) * 100}%`, background: toneVar('success'), minHeight: 2 }} />
                  <div className="w-1/2 rounded-t" style={{ height: `${(m.expenseMinor / maxBar) * 100}%`, background: toneVar('danger'), minHeight: 2 }} />
                </div>
                <span className="text-[10px] text-text-3">{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel icon={<Building2 size={14} />} title="Profit by property">
          <div className="flex flex-col gap-3">
            {propProfit.map((p) => (
              <div key={p.name}>
                <div className="flex items-center justify-between text-[12px] mb-1"><span className="font-medium">{p.name}</span><span className="font-mono">{money(p.profitMinor)} · {p.marginPct}%</span></div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex">
                  <div className="h-full" style={{ width: `${(p.profitMinor / maxProfit) * 100}%`, background: toneVar('success') }} />
                  <div className="h-full" style={{ width: `${(p.expenseMinor / maxProfit) * 100}%`, background: toneVar('danger') }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel icon={<Percent size={14} />} title="Occupancy by apartment">
          <div className="flex flex-col gap-2">
            {occupancy.map((o) => (
              <div key={o.name}>
                <div className="flex items-center justify-between text-[11.5px] mb-0.5"><span className="text-text-2">{o.name} <span className="text-text-3">· {o.property}</span></span><span className="font-mono">{o.occupancyPct}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${o.occupancyPct}%`, background: toneVar(o.occupancyPct >= 70 ? 'success' : o.occupancyPct >= 45 ? 'warn' : 'danger') }} /></div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel icon={<Users size={14} />} title="Booking source performance (FR-AN-03)">
          <div className="flex flex-col gap-2.5">
            {sources.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="text-[12px] w-20 flex-none">{s.label}</span>
                <div className="flex-1 h-4 rounded bg-surface-2 overflow-hidden"><div className="h-full rounded" style={{ width: `${(s.revenueMinor / maxSrc) * 100}%`, background: toneVar('progress') }} /></div>
                <span className="text-[11px] font-mono text-text-3 w-24 text-right flex-none">{money(s.revenueMinor)} · {s.bookings}bk</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-center gap-2 mb-3"><span className="text-text-3">{icon}</span><span className="text-[12.5px] font-semibold">{title}</span></div>
      {children}
    </div>
  );
}
