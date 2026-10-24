import { Card, CardHeader, EmptyState, KpiCard, StatusPill } from '@/components/ui';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import type { InvestorProject } from '@/domain/entities';
import { Building2, TrendingUp } from 'lucide-react';
import common from '@/components/ui/workspace-layout.module.css';

const STATUS_TONE: Record<string, Tone> = { planning: 'neutral', selling: 'info', construction: 'warn', completed: 'success' };
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);

/** Callers supply already scoped rows. Recorded projections are never guarantees. */
export function InvestorProjectsView({ projects, showTotals = true }: { projects: readonly InvestorProject[]; showTotals?: boolean }) {
  const totalUnits = projects.reduce((a, p) => a + p.unitsTotal, 0);
  const soldUnits = projects.reduce((a, p) => a + p.unitsSold, 0);
  const currencies = [...new Set(projects.map((p) => p.salesToDate.currency))];
  const salesByCurrency = currencies.map((currency) => ({ currency, minor: projects.filter((p) => p.salesToDate.currency === currency).reduce((n, p) => n + p.salesToDate.minor, 0) }));
  return <div className={common.layout}>
    {showTotals && <div className={common.layout}><div className={common.grid}>
      <KpiCard label="Projects" value={String(projects.length)} icon={<Building2 size={18} />} />
      <KpiCard label="Units sold / inventory" value={`${soldUnits} / ${totalUnits}`} icon={<Building2 size={18} />} />
      <KpiCard label="Recorded sales to date" value={salesByCurrency.length > 1 ? 'By currency' : money(salesByCurrency[0]?.minor ?? 0, salesByCurrency[0]?.currency ?? 'NGN')} icon={<TrendingUp size={18} />} />
    </div>{salesByCurrency.length > 1 && <Card><CardHeader title="Recorded sales by currency" subtitle="Native amounts remain separate; no exchange rate is applied." /><dl className={common.facts}>{salesByCurrency.map((amount) => <div key={amount.currency}><dt>{amount.currency}</dt><dd>{money(amount.minor, amount.currency)}</dd></div>)}</dl></Card>}</div>}
    {projects.length ? <div className={common.analytics}>{projects.map((p) => {
      const soldPct = p.unitsTotal ? Math.round((p.unitsSold / p.unitsTotal) * 100) : 0;
      return <Card key={p.id} className={common.panel}><CardHeader title={p.name} subtitle={p.location} action={<StatusPill status={humanizeStatus(p.status)} tone={STATUS_TONE[p.status] ?? 'neutral'} />} />
        <div className={common.stack}><div><p className={common.body}>Sales · {p.unitsSold}/{p.unitsTotal} units · {soldPct}% of inventory</p><progress className="mt-3 w-full h-2 accent-primary" max={100} value={Math.max(0, Math.min(100, soldPct))} aria-label={`${p.name} inventory sold`} /></div>
          <dl className={common.facts}><div><dt>Recorded sales to date</dt><dd>{money(p.salesToDate.minor, p.salesToDate.currency)}</dd></div><div><dt>Occupancy</dt><dd>{p.occupancyPct}%</dd></div><div><dt>Recorded handover date</dt><dd>{p.handoverDate.slice(0, 10)}</dd></div><div><dt>Projected ROI · estimate</dt><dd>{p.projectedRoiPct}%</dd></div></dl>
          <p className={common.footnote}>AI-S-04 · Recorded projection, not a calibrated AI valuation or a guaranteed return. Review source assumptions, costs and timing before relying on this estimate.</p>
        </div>
      </Card>;
    })}</div> : <Card><EmptyState title="No investor projects in your scope." description="Authorised project records will appear here." /></Card>}
  </div>;
}
