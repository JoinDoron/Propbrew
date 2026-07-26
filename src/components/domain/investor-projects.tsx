import { Card, KpiCard, StatusPill } from '@/components/ui';
import { formatMoney } from '@/components/domain';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import type { InvestorProject } from '@/domain/entities';
import { Building2, TrendingUp } from 'lucide-react';

const STATUS_TONE: Record<string, Tone> = { planning: 'neutral', selling: 'info', construction: 'warn', completed: 'success' };

/** SC-08 investor dashboard, shared by the ops, admin and investor-portal
 *  routes (each passes rows already scoped for the caller). AI-S-04 projections
 *  are always labelled as estimates with their basis shown. */
export function InvestorProjectsView({ projects, showTotals = true }: { projects: readonly InvestorProject[]; showTotals?: boolean }) {
  const totalUnits = projects.reduce((a, p) => a + p.unitsTotal, 0);
  const soldUnits = projects.reduce((a, p) => a + p.unitsSold, 0);
  const salesToDate = projects.reduce((a, p) => a + p.salesToDate.minor, 0);

  return (
    <div className="flex flex-col gap-3.5">
      {showTotals && (
        <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3.5">
          <KpiCard label="Projects" value={String(projects.length)} icon={<Building2 size={18} />} />
          <KpiCard label="Units sold" value={`${soldUnits} / ${totalUnits}`} delta={`${totalUnits ? Math.round((soldUnits / totalUnits) * 100) : 0}% of inventory`} positive icon={<TrendingUp size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
          <KpiCard label="Sales to date" value={shortNaira(salesToDate)} icon={<TrendingUp size={18} />} iconBg="rgba(37,99,235,.12)" iconColor="#2563eb" />
        </div>
      )}

      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3.5">
        {projects.map((p) => {
          const soldPct = p.unitsTotal ? Math.round((p.unitsSold / p.unitsTotal) * 100) : 0;
          return (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{p.name}</h3>
                  <p className="text-[12px] text-text-3 mt-0.5">{p.location}</p>
                </div>
                <StatusPill status={humanizeStatus(p.status)} tone={STATUS_TONE[p.status] ?? 'neutral'} />
              </div>

              <div className="mt-3.5">
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="text-text-2">Sales · {p.unitsSold}/{p.unitsTotal} units</span>
                  <span className="font-mono text-text-3">{soldPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${soldPct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-border">
                <Metric label="Sales to date" value={formatMoney(p.salesToDate)} />
                <Metric label="Occupancy" value={`${p.occupancyPct}%`} />
                <Metric label="Handover" value={p.handoverDate.slice(0, 7)} />
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary-weak px-2.5 py-2">
                <span className="text-[10px] font-bold text-primary bg-surface rounded px-1.5 py-0.5">AI-S-04</span>
                <span className="text-[12px] text-text-2">
                  Projected ROI <strong>{p.projectedRoiPct}%</strong>
                </span>
                <span className="text-[11px] text-text-3 ml-auto">Estimate · sales pace + comparable handovers</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className="text-[13px] font-semibold mt-0.5 font-mono">{value}</div>
    </div>
  );
}

function shortNaira(minor: number): string {
  const major = minor / 100;
  if (major >= 1_000_000_000) return `₦${(major / 1_000_000_000).toFixed(1)}B`;
  if (major >= 1_000_000) return `₦${(major / 1_000_000).toFixed(0)}M`;
  return `₦${major.toLocaleString()}`;
}
