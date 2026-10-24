'use client';

import { useState } from 'react';
import { RotateCcw, TrendingUp } from 'lucide-react';
import { Button, CardHeader, EmptyState } from '@/components/ui';
import { PortalCard, portalMoney } from './portal-patterns';
import { PageTabs } from '@/components/ui/page-tabs';
import type { InvestorProject } from '@/domain/entities';
import { holdingOf, projectReturns } from '@/domain/investor-portal';
import { investorCurrency } from './investor-portfolio-workspace';
import { toneVar } from '@/lib/status-tones';
import layout from '@/components/ui/workspace-layout.module.css';

type Scenario = { key: string; label: string; appreciation: number; yield: number };
const SCENARIOS: Scenario[] = [{ key: 'cons', label: 'Conservative illustration', appreciation: 6, yield: 4 }, { key: 'base', label: 'Base illustration', appreciation: 12, yield: 6 }, { key: 'opt', label: 'Optimistic illustration', appreciation: 18, yield: 8 }];

export function InvestorReturnsWorkspace({ projects }: { projects: InvestorProject[] }) {
  const holdings = projects.map((project) => ({ id: project.id, name: project.name.split(' (')[0], invested: holdingOf(project).investedMinor, currency: investorCurrency(project) }));
  const currencies = [...new Set(holdings.map((holding) => holding.currency))].sort();
  const [currency, setCurrency] = useState<string>(currencies.includes('NGN') ? 'NGN' : currencies[0] ?? 'NGN');
  const [selected, setSelected] = useState('all');
  const [years, setYears] = useState(5);
  const [appreciation, setAppreciation] = useState(12);
  const [rentalYield, setRentalYield] = useState(6);
  const scoped = holdings.filter((holding) => holding.currency === currency);
  const invested = selected === 'all' ? scoped.reduce((sum, holding) => sum + holding.invested, 0) : scoped.find((holding) => holding.id === selected)?.invested ?? 0;
  const projection = projectReturns(invested, years, appreciation, rentalYield);
  const width = (minor: number) => `${projection.totalValueMinor > 0 ? minor / projection.totalValueMinor * 100 : 0}%`;
  const reset = () => { setYears(5); setAppreciation(12); setRentalYield(6); };
  return <div className={layout.layout}>
    <div className={layout.notice}><TrendingUp size={18} /><p>Interactive illustration, not an investment forecast<span>The initial stake is modelled from sample holdings, not verified ownership. Scenarios are user-adjustable arithmetic, not AI advice, a valuation or a guarantee. Currencies are never combined or converted.</span></p></div>
    <div className={layout.toolbar}><label className={layout.field}><span className={layout.label}>Illustration currency</span><select className={layout.select} value={currency} onChange={(event) => { setCurrency(event.target.value); setSelected('all'); }}>{(currencies.length ? currencies : ['NGN']).map((value) => <option key={value}>{value}</option>)}</select></label><label className={layout.field}><span className={layout.label}>Project scope</span><select value={selected} onChange={(event) => setSelected(event.target.value)} className={layout.select}><option value="all">Whole {currency} portfolio</option>{scoped.map((holding) => <option key={holding.id} value={holding.id}>{holding.name}</option>)}</select></label></div>
    <PageTabs label="Investment return sections" items={[
      { id: 'forecast', label: 'Return illustration', content: <div className={layout.layout}>{holdings.length ? <PortalCard><CardHeader title={`Illustrative value after ${years} ${years === 1 ? 'year' : 'years'}`} subtitle={`Compound growth ${appreciation}% / year · simple rental yield ${rentalYield}% / year · ${currency}`} /><p className={layout.metric}>{portalMoney(projection.totalValueMinor, currency)}</p><p className={`${layout.body} mt-4`}>Modelled gain and rental income: {portalMoney(projection.capitalGainMinor + projection.rentalIncomeMinor, currency)} · {projection.roiPct}% total illustrative return.</p><div className="mt-6 h-3 flex rounded overflow-hidden bg-surface-2" role="img" aria-label={`Sample stake ${portalMoney(invested, currency)}, illustrative capital growth ${portalMoney(projection.capitalGainMinor, currency)}, illustrative rental income ${portalMoney(projection.rentalIncomeMinor, currency)}`}><span style={{ width: width(invested), background: toneVar('info') }} /><span style={{ width: width(projection.capitalGainMinor), background: toneVar('success') }} /><span style={{ width: width(projection.rentalIncomeMinor), background: toneVar('progress') }} /></div><dl className={`${layout.facts} mt-6`}><div><dt>Sample invested stake</dt><dd>{portalMoney(invested, currency)}</dd></div><div><dt>Illustrative capital growth</dt><dd>{portalMoney(projection.capitalGainMinor, currency)}</dd></div><div><dt>Illustrative rental income</dt><dd>{portalMoney(projection.rentalIncomeMinor, currency)}</dd></div></dl></PortalCard> : <PortalCard><EmptyState title="No holdings to model" description="An illustration becomes available when project records are linked to your investor scope." /></PortalCard>}</div> },
      { id: 'assumptions', label: 'Scenario assumptions', content: <div className={layout.layout}><PortalCard><CardHeader title="Adjust the illustration" subtitle="Changes stay in this browser session" action={<Button icon={<RotateCcw size={16} />} onClick={reset}>Reset assumptions</Button>} /><div className={layout.stack}><Slider label="Hold period" value={years} min={1} max={10} suffix={years === 1 ? 'year' : 'years'} onChange={setYears} /><Slider label="Annual appreciation" value={appreciation} min={0} max={25} suffix="% per year" onChange={setAppreciation} /><Slider label="Rental yield" value={rentalYield} min={0} max={15} suffix="% per year" onChange={setRentalYield} /><div className={layout.filters}>{SCENARIOS.map((scenario) => <Button key={scenario.key} aria-pressed={appreciation === scenario.appreciation && rentalYield === scenario.yield} onClick={() => { setAppreciation(scenario.appreciation); setRentalYield(scenario.yield); }}>{scenario.label}</Button>)}</div></div></PortalCard><PortalCard><CardHeader title="Assumptions and exclusions" /><p className={layout.body}>This model compounds the selected appreciation rate on the sample stake and adds simple rental income at the chosen yield. It does not deduct tax, financing, vacancy, transaction costs, maintenance or inflation, and it does not simulate losses. The scenario names are illustrative labels, not risk assessments or recommendations.</p></PortalCard></div> },
    ]} />
  </div>;
}

function Slider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <label className={layout.field}><span className={layout.toolbar}><span className={layout.label}>{label}</span><span className="text-sm tabular-nums">{value} {suffix}</span></span><input type="range" min={min} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} aria-valuetext={`${value} ${suffix}`} className="w-full min-h-11 accent-primary" /></label>;
}
