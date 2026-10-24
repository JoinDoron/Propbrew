'use client';

import { useState } from 'react';
import { ArrowUpRight, Banknote, Building2, Fuel, Info, Search, TriangleAlert, Wrench, X } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { estateIndex, type EstateVitals } from '@/domain/facility';
import styles from '@/components/ui/workspace-layout.module.css';
import local from './portfolio-workspace.module.css';

const money = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(minor / 100);
const shortMoney = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
type SortKey = 'index' | 'diesel' | 'arrears' | 'overdue';
const SORTS: { key: SortKey; label: string }[] = [{ key: 'index', label: 'Attention first' }, { key: 'diesel', label: 'Diesel estimate' }, { key: 'arrears', label: 'Arrears' }, { key: 'overdue', label: 'Overdue work' }];

export type PortfolioEstateVitals = EstateVitals & { systemCount?: number };
type LoadedRecordCounts = { estates: number; systems: number; alarms: number; generators: number; contracts: number; workOrders: number; invoices?: number };
const hasMeasuredHealth = (estate: PortfolioEstateVitals) => (estate.systemCount ?? 0) > 0;

export function PortfolioWorkspace({ estates, totals, canSeeMoney, excludedCurrencyInvoices = 0, loadedRecordCounts }: {
  estates: PortfolioEstateVitals[];
  totals: { avgIndex: number; openWos: number; overdueWos: number; openAlarms: number; dieselSpendMinor: number; arrearsMinor: number };
  canSeeMoney: boolean;
  excludedCurrencyInvoices?: number;
  loadedRecordCounts?: LoadedRecordCounts;
}) {
  const [sort, setSort] = useState<SortKey>('index');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = estates.filter((estate) => estate.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => {
    if (sort === 'diesel') return b.dieselSpendMinor - a.dieselSpendMinor;
    if (sort === 'arrears' && canSeeMoney) return (b.arrearsMinor ?? 0) - (a.arrearsMinor ?? 0);
    if (sort === 'overdue') return b.overdueWos - a.overdueWos;
    if (hasMeasuredHealth(a) !== hasMeasuredHealth(b)) return hasMeasuredHealth(a) ? 1 : -1;
    return estateIndex(a).score - estateIndex(b).score;
  });
  const selected = estates.find((estate) => estate.siteId === openId) ?? null;
  const measured = estates.filter(hasMeasuredHealth);
  const worst = [...measured].sort((a, b) => estateIndex(a).score - estateIndex(b).score)[0];
  const measuredAverage = measured.length ? Math.round(measured.reduce((sum, estate) => sum + estateIndex(estate).score, 0) / measured.length) : null;

  return <div className={styles.layout}>
    <div className={styles.context}><p className={styles.metadata}>{estates.length} recorded estate{estates.length === 1 ? '' : 's'} · Authorised scope only</p><StatusPill status="Rules-based snapshot" tone="info" /></div>
    <PageTabs label="Estate portfolio sections" items={[
      { id: 'estates', label: 'Estate scorecards', content: <div className={styles.layout}>
        <div className={styles.toolbar}><label className={styles.search}><Search size={17} aria-hidden="true" /><span className="sr-only">Search estates</span><input type="search" placeholder="Search estates…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={local.sort}><span className={styles.label}>Sort by</span><select className={styles.select} aria-label="Sort estates" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>{SORTS.filter((option) => canSeeMoney || option.key !== 'arrears').map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label></div>
        {sorted.length ? <div className={styles.analytics}>{sorted.map((estate) => <Card key={estate.siteId} className={styles.panel}>
          <CardHeader title={estate.name} subtitle={estate.kind} action={<EstateIndex estate={estate} />} />
          <dl className={local.metrics}>
            <Fact label="Systems health index" value={hasMeasuredHealth(estate) ? `${estate.healthScore}/100` : 'Health not measured'} /><Fact label="Loaded system records" value={estate.systemCount === undefined ? 'Coverage not supplied' : String(estate.systemCount)} />
            <Fact label="Open work orders" value={String(estate.openWos)} />
            <Fact label="Overdue work orders" value={String(estate.overdueWos)} /><Fact label="Open alarms" value={String(estate.openAlarms)} />
            <Fact label="Monthly diesel estimate" value={money(estate.dieselSpendMinor)} /><Fact label="Genset reliance" value={`${estate.gensetPct}%`} />
            <Fact label="Contracts needing review" value={String(estate.contractsAtRisk)} />{canSeeMoney && <Fact label="Recorded arrears · NGN only" value={estate.arrearsMinor === null ? 'Not available' : money(estate.arrearsMinor)} />}
          </dl>
          <div className={local.cardFooter}><span className={styles.metadata}>Composite indicators support human review.</span><Button variant="ghost" onClick={() => setOpenId(estate.siteId)} aria-label={`View portfolio metrics for ${estate.name}`}>View details <ArrowUpRight size={15} aria-hidden="true" /></Button></div>
        </Card>)}</div> : <Card><EmptyState icon={<Building2 size={22} />} title={estates.length ? 'No matching estates' : 'No estates in your scope'} description={estates.length ? 'Try another estate name.' : 'Authorised estate metrics will appear here.'} action={estates.length ? <Button onClick={() => setQuery('')}>Clear search</Button> : undefined} /></Card>}
      </div> },
      { id: 'overview', label: 'Portfolio summary', content: <div className={styles.layout}>
        <div className={styles.metrics}><KpiCard label="Open work orders" value={String(totals.openWos)} icon={<Wrench size={18} />} /><KpiCard label="Open alarms" value={String(totals.openAlarms)} icon={<TriangleAlert size={18} />} /><KpiCard label="Monthly diesel estimate" value={shortMoney(totals.dieselSpendMinor)} icon={<Fuel size={18} />} />{canSeeMoney && <KpiCard label="Recorded arrears · NGN only" value={shortMoney(totals.arrearsMinor)} icon={<Banknote size={18} />} />}</div>
        <Card className={styles.panel}><CardHeader title="Portfolio review" subtitle="A composite view of the available estate records" /><dl className={styles.facts}><div><dt>Average index · measured estates only</dt><dd>{measuredAverage === null ? 'Health not measured' : `${measuredAverage}/100`}</dd></div><div><dt>Health coverage</dt><dd>{measured.length} of {estates.length} estates have loaded system records</dd></div><div><dt>Overdue work orders</dt><dd>{totals.overdueWos}</dd></div><div><dt>Lowest index among measured estates</dt><dd>{worst?.name ?? 'No measured estates'}</dd></div></dl><p className={styles.footnote}>The index is a deterministic summary of recorded health, work, alarms and contract signals. Only estates with loaded system records contribute to the average and index ranking. Missing data is not evidence of healthy systems. It is not a provider-backed AI prediction or a live safety assessment.</p></Card>
      </div> },
    ]} />
    <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>Recorded indicators, not a live control feed.<span>Diesel cost is modelled from recorded generator runtime. Arrears are shown only when your billing permission allows it.</span></p></div>
    {canSeeMoney && <div className={styles.notice}><Banknote size={18} aria-hidden="true" /><p>Arrears coverage: NGN invoices only.<span>Both the charge and paid amount must be in NGN. {excludedCurrencyInvoices} loaded invoice{excludedCurrencyInvoices === 1 ? ' is' : 's are'} excluded because another currency is recorded. No FX conversion or cross-currency netting is applied.</span></p></div>}
    <Card className={styles.panel}><CardHeader title="Loaded-record snapshot" subtitle="Source reads are capped, so these figures may undercount your complete portfolio." />
      {loadedRecordCounts && <dl className={local.coverage}>
        {Object.entries(loadedRecordCounts).filter(([key, count]) => count !== undefined && (canSeeMoney || key !== 'invoices')).map(([key, count]) => <div key={key}><dt>{({ estates: 'Estates', systems: 'Systems', alarms: 'Alarms', generators: 'Generators', contracts: 'Contracts', workOrders: 'Work orders', invoices: 'Invoices' } as Record<string, string>)[key]}</dt><dd>{count} loaded</dd></div>)}
      </dl>}
      <p className={styles.metadata}>This view loads at most 100 estates and 100 records per systems, alarms, generators and contracts source, plus 500 work orders and 500 invoices. It does not fetch subsequent pages. Counts and estimates describe loaded records, not an exhaustive estate audit.</p>
    </Card>
    {selected && <PortalDialog label={`Portfolio metrics for ${selected.name}`} drawer width={560} onClose={() => setOpenId(null)}>
      <div className={styles.drawer}>
        <header className={styles.dialogHeader}><div><h2 className={styles.dialogTitle}>{selected.name}</h2><p className={styles.metadata}>Recorded estate indicators</p></div><IconButton aria-label="Close estate metrics" onClick={() => setOpenId(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          <EstateIndex estate={selected} />
          <dl className={styles.facts}>
            <Fact label="Systems health index" value={hasMeasuredHealth(selected) ? `${selected.healthScore}/100` : 'Health not measured'} />
            <Fact label="Loaded system records" value={selected.systemCount === undefined ? 'Coverage not supplied' : String(selected.systemCount)} />
            <Fact label="Open work orders" value={String(selected.openWos)} /><Fact label="Overdue work orders" value={String(selected.overdueWos)} />
            <Fact label="Open alarms" value={String(selected.openAlarms)} /><Fact label="Monthly diesel estimate" value={money(selected.dieselSpendMinor)} />
            <Fact label="Genset reliance" value={`${selected.gensetPct}%`} /><Fact label="Contract review signals" value={String(selected.contractsAtRisk)} />
            {canSeeMoney && <Fact label="Recorded arrears · NGN only" value={selected.arrearsMinor === null ? 'Not available' : money(selected.arrearsMinor)} />}
          </dl>
          {!hasMeasuredHealth(selected) && <p className={styles.metadata}>System health and the composite index are not measured for this estate because no system coverage was supplied.</p>}
          <p className={styles.metadata}>These loaded-record indicators do not trigger penalties, dispatch maintenance or make financial decisions.</p>
        </div>
      </div>
    </PortalDialog>}
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

function EstateIndex({ estate }: { estate: PortfolioEstateVitals }) {
  if (!hasMeasuredHealth(estate)) return <StatusPill status="Index not measured" tone="muted" />;
  const index = estateIndex(estate);
  return <StatusPill status={`${index.label} · ${index.score}/100`} tone={index.band} />;
}
