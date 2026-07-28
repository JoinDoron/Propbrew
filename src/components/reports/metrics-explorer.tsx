'use client';

import { useMemo, useState } from 'react';
import { Download, BookmarkPlus, Bookmark, BarChart3 } from 'lucide-react';
import { formatMoney } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import { METRICS, weeklyThroughput, modelledTrend, breakdownCsv, type Dataset, type Metric, type Unit } from '@/domain/reports';

const RANGES = [{ w: 6, label: '6 wk' }, { w: 10, label: '10 wk' }, { w: 12, label: '12 wk' }];

function fmt(unit: Unit, v: number): string {
  if (unit === 'money') return formatMoney({ minor: v, currency: 'NGN' } as Parameters<typeof formatMoney>[0]);
  if (unit === 'percent') return `${v}%`;
  return v.toLocaleString();
}

type View = { name: string; metricId: string; dim: string };

export function MetricsExplorer({ dataset, seesInvoices }: { dataset: Dataset; seesInvoices: boolean }) {
  const available = useMemo(() => METRICS.filter((m) => !m.needsInvoices || seesInvoices), [seesInvoices]);
  const [metricId, setMetricId] = useState(available[0].id);
  const [dim, setDim] = useState(available[0].dims[0].id);
  const [weeks, setWeeks] = useState(10);
  const [views, setViews] = useState<View[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const metric = available.find((m) => m.id === metricId) ?? available[0];
  const bars = metric.breakdown(dataset, metric.dims.some((d) => d.id === dim) ? dim : metric.dims[0].id);
  const maxBar = Math.max(...bars.map((b) => b.value), 1);
  const activeDim = metric.dims.some((d) => d.id === dim) ? dim : metric.dims[0].id;

  function selectMetric(m: Metric) {
    setMetricId(m.id);
    if (!m.dims.some((d) => d.id === dim)) setDim(m.dims[0].id);
  }
  function saveView() {
    const name = `${metric.label} · ${activeDim}`;
    if (!views.some((v) => v.name === name)) setViews((p) => [{ name, metricId, dim: activeDim }, ...p]);
    flash('View saved');
  }
  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2600); }
  function exportCsv() {
    const csv = breakdownCsv(metric, activeDim, bars);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${metric.id}-by-${activeDim}.csv`; a.click();
    URL.revokeObjectURL(url);
    flash('Exported CSV');
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* KPI gallery */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-3">
        {available.map((m) => {
          const v = m.value(dataset);
          const real = Boolean(m.realTrend);
          const pts = real ? weeklyThroughput(dataset.workOrders, 10, m.id === 'spend' ? (w) => w.cost?.minor ?? 0 : undefined) : modelledTrend(m.id, v);
          const selected = m.id === metricId;
          return (
            <button key={m.id} onClick={() => selectMetric(m)} className={`text-left rounded-2xl border p-3.5 transition-all ${selected ? 'border-primary bg-primary/[0.04] shadow-float' : 'border-border bg-surface shadow-card hover:border-primary/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12.5px] text-text-2 font-medium">{m.label}</span>
                <Sparkline points={pts} color={selected ? 'var(--primary)' : 'var(--text-3)'} />
              </div>
              <div className="text-[22px] font-bold tracking-[-0.02em] mt-1.5">{fmt(m.unit, v)}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {m.requirementIds.map((r) => <span key={r} className="text-[9.5px] font-semibold text-text-3 bg-surface-2 border border-border-2 rounded px-1 py-0.5">{r}</span>)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Explorer */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <BarChart3 size={15} className="text-primary" />
          <span className="text-[13px] font-semibold">{metric.label}</span>
          <span className="text-[12px] text-text-3">by</span>
          <div className="flex gap-1">
            {metric.dims.map((d) => (
              <button key={d.id} onClick={() => setDim(d.id)} className={`text-[11.5px] px-2 h-7 rounded-lg border ${activeDim === d.id ? 'border-primary text-primary bg-primary-weak font-medium' : 'border-border-2 text-text-3'}`}>{d.label}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex rounded-lg border border-border-2 overflow-hidden">
              {RANGES.map((r) => <button key={r.w} onClick={() => setWeeks(r.w)} className={`text-[11px] px-2 h-7 ${weeks === r.w ? 'bg-primary text-white' : 'text-text-3'}`}>{r.label}</button>)}
            </div>
            <button onClick={saveView} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border-2 text-[11.5px] text-text-2 hover:border-primary"><BookmarkPlus size={13} /> Save</button>
            <button onClick={exportCsv} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-white text-[11.5px] font-medium"><Download size={13} /> Export</button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 min-[720px]:grid-cols-[1fr_260px] gap-4">
          {/* Breakdown bars */}
          <div className="flex flex-col gap-2.5">
            {bars.length === 0 && <p className="text-[12.5px] text-text-3">No data for this breakdown.</p>}
            {bars.map((b) => (
              <div key={b.key} className="flex items-center gap-3">
                <span className="w-28 text-[12px] text-text-2 flex-none truncate capitalize">{b.label}</span>
                <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-md flex items-center justify-end px-2" style={{ width: `${Math.max((b.value / maxBar) * 100, 8)}%`, background: toneVar('info') }}>
                    <span className="text-[11px] font-bold text-white">{fmt(metric.unit, b.value)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trend */}
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between mb-2"><span className="text-[11.5px] font-semibold text-text-2">Trend</span><span className="text-[10px] text-text-3">{metric.realTrend ? `throughput · ${weeks} wk` : 'indicative'}</span></div>
            <Sparkline
              points={metric.realTrend ? weeklyThroughput(dataset.workOrders, weeks, metric.id === 'spend' ? (w) => w.cost?.minor ?? 0 : undefined) : modelledTrend(metric.id, metric.value(dataset), weeks)}
              color="var(--primary)" big
            />
            <div className="text-[10.5px] text-text-3 mt-2 flex flex-wrap gap-1">Serves {metric.requirementIds.join(' · ')}</div>
          </div>
        </div>

        {views.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-3">Saved views:</span>
            {views.map((v) => (
              <button key={v.name} onClick={() => { setMetricId(v.metricId); setDim(v.dim); }} className="inline-flex items-center gap-1 text-[11px] px-2 h-6 rounded-full border border-border-2 text-text-2 hover:border-primary"><Bookmark size={11} /> {v.name}</button>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Sparkline({ points, color, big = false }: { points: number[]; color: string; big?: boolean }) {
  const w = big ? 232 : 60;
  const h = big ? 56 : 22;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="flex-none overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={big ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" />
      {big && points.map((p, i) => <circle key={i} cx={i * step} cy={h - ((p - min) / span) * (h - 4) - 2} r={1.6} fill={color} />)}
    </svg>
  );
}
