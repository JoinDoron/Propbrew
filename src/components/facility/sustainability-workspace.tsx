'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Droplet, Flame, Fuel, Leaf, Lightbulb, Sun, Target, TrendingDown, Wrench } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { FacilityDialog, FacilityFeedback, FacilityKpi } from './facility-ui';
import { facilityMoney } from './facility-format';
import { toneVar, type Tone } from '@/lib/status-tones';
import { targetProgress, type SustainabilityTarget, type ReductionScenario } from '@/domain/facility';
import { setSustainabilityTarget } from '@/server/actions/facility';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-specialists.module.css';

const SCEN_ICON: Record<string, React.ReactNode> = { solar: <Sun size={18} />, service: <Wrench size={18} />, led: <Lightbulb size={18} />, gas: <Flame size={18} /> };
export type MonthPoint = { label: string; co2Kg: number; dieselLitres: number };

export function SustainabilityWorkspace({ esg, kpis, months, mix, scenarios, targets, canMutate = false }: {
  esg: { score: number; band: Tone; label: string };
  kpis: { carbonKg: number; gensetPct: number; waterM3: number; renewableReadiness: number };
  months: MonthPoint[]; mix: { gridKwh: number; gensetKwh: number };
  scenarios: ReductionScenario[]; targets: SustainabilityTarget[]; canMutate?: boolean;
}) {
  const maxCo2 = Math.max(...months.map((month) => month.co2Kg), 1);
  const totalKwh = mix.gridKwh + mix.gensetKwh;
  const gridShare = totalKwh > 0 ? Math.max(0, Math.min(100, Math.round(mix.gridKwh / totalKwh * 100))) : null;
  const [editing, setEditing] = useState<SustainabilityTarget | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const trendDelta = months.length >= 2 && months[0].co2Kg > 0 ? Math.round((months[months.length - 1].co2Kg - months[0].co2Kg) / months[0].co2Kg * 100) : null;

  return <div className={styles.stack}>
    <Card className={styles.panel}>
      <CardHeader title="Sustainability performance" subtitle="Rules-based operational indicator · not an independently verified ESG rating" action={<StatusPill status={esg.label} tone={esg.band} />} />
      <div className={styles.summary}><div className={styles.ring} aria-label={'Operational sustainability indicator ' + esg.score + ' out of 100'}><svg width={96} height={96} viewBox="0 0 36 36" className="-rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={toneVar(esg.band)} strokeWidth="3" strokeLinecap="round" strokeDasharray={String(Math.max(0, Math.min(100, esg.score)) * .974) + ' 97.4'} /></svg><span className={styles.ringLabel}><strong>{esg.score}</strong><small>/ 100</small></span></div><div><h2 className={styles.title}>Resource efficiency at a glance</h2><p className={styles.body}>{trendDelta === null ? 'Insufficient baseline for a percentage change.' : 'Calculated carbon ' + (trendDelta <= 0 ? 'down ' : 'up ') + Math.abs(trendDelta) + '% across the recorded period.'}</p><p className={styles.metadata}>{kpis.renewableReadiness}% recorded grid share. Grid supply is not a measurement of renewable generation.</p></div></div>
    </Card>

    <PageTabs label="Sustainability sections" items={[
      { id: 'performance', label: 'ESG performance', content: <div className={styles.stack}>
        <div className={layout.metrics}><FacilityKpi label="Carbon this month" value={(kpis.carbonKg / 1000).toFixed(1) + 't'} sub="Calculated CO₂ from diesel" tone="success" icon={<Leaf size={18} />} /><FacilityKpi label="Genset reliance" value={kpis.gensetPct + '%'} sub="Share of recorded run-hours" tone={kpis.gensetPct <= 30 ? 'success' : 'warn'} icon={<Fuel size={18} />} /><FacilityKpi label="Water draw" value={kpis.waterM3.toLocaleString('en-NG') + ' m³'} sub="Recorded for this month" tone="info" icon={<Droplet size={18} />} /><FacilityKpi label="Recorded grid share" value={kpis.renewableReadiness + '%'} sub="Not a renewable-energy measurement" tone="progress" icon={<Sun size={18} />} /></div>
        <div className={styles.twoColumns}>
          <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Carbon trend" subtitle="Calculated monthly CO₂ from recorded diesel use" action={<TrendingDown size={18} className="text-primary" />} /></div>{months.length ? <div className={styles.panelBody}><div className={styles.scroll} role="region" tabIndex={0} aria-label="Monthly calculated carbon chart"><div className={styles.chart} role="img" aria-label={'Calculated carbon and recorded diesel by month: ' + months.map((month) => month.label + ', ' + month.co2Kg + ' kg CO₂, ' + month.dieselLitres + ' litres diesel').join('; ')}>{months.map((month, index) => <div key={month.label} className={styles.chartColumn}><span>{month.co2Kg.toLocaleString('en-NG')} kg</span><div style={{ height: Math.max(0, month.co2Kg / maxCo2 * 160), background: index === months.length - 1 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 22%, var(--surface))' }} /><span>{month.label}</span><span>{month.dieselLitres.toLocaleString('en-NG')} L diesel</span></div>)}</div></div></div> : <div className={styles.empty}><EmptyState icon={<Leaf size={26} />} title="No carbon baseline" description="Record monthly diesel use before comparing calculated emissions over time." /></div>}<p className={styles.footer}>Calculated operational emissions are planning estimates, not verified carbon reporting.</p></Card>
          <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Energy mix" subtitle="Recorded electricity supply for this month" action={<StatusPill status={gridShare === null ? 'No readings' : gridShare + '% grid'} tone="info" />} /></div>{gridShare !== null ? <div className={styles.panelBody}><div className={styles.stack}><div className={styles.summary}><div className={styles.ring} aria-label={'Recorded energy mix ' + gridShare + '% grid and ' + (100 - gridShare) + '% diesel generator'}><svg width={96} height={96} viewBox="0 0 36 36" className="-rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke={toneVar('warn')} strokeWidth="4" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary)" strokeWidth="4" strokeDasharray={String(gridShare * .974) + ' 97.4'} /></svg><span className={styles.ringLabel}><strong>{gridShare}%</strong><small>grid</small></span></div><div><dl className={styles.facts}><div><dt>Grid electricity</dt><dd>{mix.gridKwh.toLocaleString('en-NG')} kWh</dd></div><div><dt>Diesel generator</dt><dd>{mix.gensetKwh.toLocaleString('en-NG')} kWh</dd></div><div><dt>Total recorded</dt><dd>{totalKwh.toLocaleString('en-NG')} kWh</dd></div><div><dt>Genset share</dt><dd>{100 - gridShare}%</dd></div></dl></div></div><div className={styles.legend}><span><i className={styles.dot} style={{ background: 'var(--primary)' }} aria-hidden="true" />Grid</span><span><i className={styles.dot} style={{ background: toneVar('warn') }} aria-hidden="true" />Diesel generator</span></div></div></div> : <div className={styles.empty}><EmptyState icon={<Fuel size={26} />} title="No energy mix recorded" description="Grid and generator readings are needed before a supply share can be calculated." /></div>}<p className={styles.footer}>Lower generator use may reduce diesel cost and modelled emissions. Grid share alone does not verify a renewable-energy supply.</p></Card>
        </div>
      </div> },
      { id: 'pathways', label: 'Reduction pathways', content: <div className={styles.stack}><Card><CardHeader title="Reduction pathways" subtitle="Modelled from recorded diesel use · compare assumptions before committing expenditure" /><p className={styles.body}>These are planning scenarios, not supplier quotations, approved budgets or guaranteed savings. No equipment order or payment is created here.</p></Card>{scenarios.length ? <div className={styles.recordGrid}>{scenarios.map((scenario) => <Card key={scenario.id} padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title={scenario.title} subtitle="Modelled reduction scenario" action={<span className={styles.icon}>{SCEN_ICON[scenario.id] ?? <Leaf size={18} />}</span>} /></div><div className={styles.panelBody}><div className={styles.stack}><p className={styles.body}>{scenario.detail}</p><dl className={styles.facts}><div><dt>Estimated CO₂ avoided / year</dt><dd>{scenario.co2SavedKg.toLocaleString('en-NG')} kg</dd></div><div><dt>Estimated savings / year · NGN</dt><dd>{facilityMoney(scenario.nairaSavedMinor)}</dd></div><div><dt>Estimated payback</dt><dd>{scenario.paybackMonths === null ? 'Not calculated' : scenario.paybackMonths + ' months'}</dd></div><div><dt>Estimated capital cost · NGN</dt><dd>{facilityMoney(scenario.capexMinor)}</dd></div></dl></div></div><p className={styles.footer}>Validate site suitability, delivery costs and the operating baseline with an authorised specialist before approval.</p></Card>)}</div> : <Card><EmptyState icon={<TrendingDown size={26} />} title="No reduction scenarios" description="No modelled pathways are available for the current recorded operating baseline." /></Card>}</div> },
      { id: 'targets', label: 'Targets', content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Sustainability targets" subtitle="Recorded baseline, current measurement, target and due date" action={<Target size={18} className="text-primary" />} /></div>{targets.length ? <ul className={styles.list}>{targets.map((target) => {
        const progress = targetProgress(target);
        return <li key={target.id} className={styles.row}><div className={styles.rowContent}><div className={styles.toolbar}><h3 className={styles.title}>{target.label}</h3><StatusPill status={progress.pct + '% progress'} tone={progress.band} /></div><progress className={styles.progress} max={100} value={Math.max(0, Math.min(100, progress.pct))} aria-label={target.label + ' progress'} /><dl className={styles.facts}><div><dt>Baseline</dt><dd>{target.baselineValue.toLocaleString('en-NG')} {target.unit}</dd></div><div><dt>Current measurement</dt><dd>{target.currentValue.toLocaleString('en-NG')} {target.unit}</dd></div><div><dt>Target</dt><dd>{target.targetValue.toLocaleString('en-NG')} {target.unit}</dd></div><div><dt>Due date</dt><dd>{target.dueISO}</dd></div></dl></div>{canMutate ? <Button aria-label={'Adjust ' + target.label} onClick={() => { setFeedback(null); setEditing(target); }}>Adjust target</Button> : null}</li>;
      })}</ul> : <div className={styles.empty}><EmptyState icon={<Target size={26} />} title="No targets recorded" description="No sustainability targets have been recorded in your current facility scope." /></div>}<p className={styles.footer}>Progress is calculated against recorded values. Adjusting a target changes the planning record, not a measured reading.</p></Card> },
    ]} />

    {editing ? <TargetDialog target={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setFeedback('Sustainability target updated.'); }} /> : feedback ? <FacilityFeedback message={feedback} onDismiss={() => setFeedback(null)} /> : null}
  </div>;
}

function TargetDialog({ target, onClose, onDone }: { target: SustainabilityTarget; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [value, setValue] = useState(String(target.targetValue));
  const [error, setError] = useState<string | null>(null);
  function submit() {
    if (pending || inFlight.current || value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await setSustainabilityTarget(target.id, Number(value));
        if (!result.ok) { setError(result.error); return; }
        router.refresh();
        onDone();
      } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); }
      finally { inFlight.current = false; }
    });
  }
  return <FacilityDialog title="Adjust sustainability target" onClose={onClose} pending={pending}><form className={styles.stack} onSubmit={(event) => { event.preventDefault(); submit(); }}><div className={styles.notice}><p className={styles.title}>{target.label}</p><p>Baseline {target.baselineValue} {target.unit} · current measurement {target.currentValue} {target.unit}.</p></div><label className={styles.field}>Target ({target.unit})<input disabled={pending} required type="number" min={0} step="any" value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" className="pb-form-control" autoFocus /></label><p className={styles.body}>This changes the planning target only. The recorded current measurement is not changed.</p>{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || value.trim() === ''} icon={<Check size={16} />}>{pending ? 'Saving…' : 'Save target'}</Button></div></form></FacilityDialog>;
}
