'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Droplet, Fuel, Gauge, Leaf, Plug, Zap } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { FacilityDialog, FacilityFeedback, FacilityKpi } from './facility-ui';
import { facilityMoney } from './facility-format';
import { toneVar, type Tone } from '@/lib/status-tones';
import { refuelForecast, fuelAnomaly, dieselCost, co2Kg, type Generator } from '@/domain/facility';
import { logRefuel, logMeterReading } from '@/server/actions/facility';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-specialists.module.css';

export type GenRow = Generator & { siteName: string };
export type MeterRow = { id: string; label: string; kind: string; unit: string; reading: number; previous: number; atISO: string };
const GEN_STATUS_TONE: Record<string, Tone> = { running: 'success', standby: 'info', fault: 'danger' };
const date = (value: string) => new Date(value).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
const planningDate = (value: string) => new Date(value).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium' });

export function EnergyWorkspace({ generators, meters, kpis, reliance, nowMs, canMutate = false }: {
  generators: GenRow[]; meters: MeterRow[];
  kpis: { dieselSpendMinor: number; litresMonth: number; costPerKwhMinor: number; co2Kg: number };
  reliance: { gensetPct: number; gridPct: number }; nowMs: number; canMutate?: boolean;
}) {
  const [refuelFor, setRefuelFor] = useState<GenRow | null>(null);
  const [meterFor, setMeterFor] = useState<MeterRow | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  return <div className={styles.stack}>
    <PageTabs label="Energy and utilities sections" items={[
      { id: 'overview', label: 'Energy overview', content: <div className={styles.stack}>
        <div className={layout.metrics}><FacilityKpi label="Estimated diesel cost" value={facilityMoney(kpis.dieselSpendMinor)} note={kpis.litresMonth.toLocaleString('en-NG') + ' L estimated from runtime · not booked spend'} tone="warn" icon={<Fuel size={18} />} /><FacilityKpi label="Genset reliance" value={reliance.gensetPct + '%'} note={reliance.gridPct + '% grid'} tone={reliance.gensetPct > 60 ? 'warn' : 'info'} icon={<Zap size={18} />} /><FacilityKpi label="Cost / kWh" value={facilityMoney(kpis.costPerKwhMinor)} note="Estimated diesel generation cost" tone="info" icon={<Gauge size={18} />} /><FacilityKpi label="Carbon" value={(kpis.co2Kg / 1000).toFixed(1) + 't'} note="Calculated CO₂ from recorded diesel use" tone="neutral" icon={<Leaf size={18} />} /></div>
        <Card className={styles.panel}><CardHeader title="Power source split" subtitle="Run-hour estimate over the recorded month · not a connected electricity feed" action={<Plug size={20} className="text-primary" />} /><div className={styles.stack}><div className={styles.track} role="img" aria-label={'Generator ' + reliance.gensetPct + ' percent, grid ' + reliance.gridPct + ' percent'}><span style={{ width: Math.max(0, Math.min(100, reliance.gensetPct)) + '%', background: toneVar('warn') }} /><span style={{ width: Math.max(0, Math.min(100, reliance.gridPct)) + '%', background: toneVar('info') }} /></div><div className={styles.legend}><span><i className={styles.dot} style={{ background: toneVar('warn') }} />Generator · {reliance.gensetPct}%</span><span><i className={styles.dot} style={{ background: toneVar('info') }} />Grid · {reliance.gridPct}%</span></div><p className={styles.metadata}>Snapshot · {date(new Date(nowMs).toISOString())}. Cost and carbon are planning estimates, not supplier invoices or verified emissions statements.</p></div></Card>
      </div> },
      { id: 'generators', label: 'Generators & fuel', content: generators.length ? <div className={styles.recordGrid}>{generators.map((generator) => {
        const forecast = refuelForecast(generator, nowMs);
        const anomaly = fuelAnomaly(generator);
        return <Card key={generator.id} className={styles.panel}><CardHeader title={generator.name} subtitle={generator.siteName + ' · ' + generator.capacityKva + ' kVA'} action={<StatusPill status={generator.status} tone={GEN_STATUS_TONE[generator.status] ?? 'neutral'} />} /><div className={styles.stack}><div><div className={styles.barHeader}><span>Recorded fuel level</span><strong className="font-medium">{generator.fuelPct}% · {forecast.litresRemaining.toLocaleString('en-NG')} L</strong></div><progress className={styles.progress + ' mt-3'} max={100} value={Math.max(0, Math.min(100, generator.fuelPct))} aria-label={generator.name + ' recorded fuel percentage'} /></div><div className={styles.notice}><div className={styles.toolbar}><p className={styles.rowTitle}>Estimated fuel runway</p><StatusPill status={!forecast.runsDryISO ? 'No draw estimate' : forecast.daysToEmpty <= 1.5 ? 'Refuel review · urgent' : forecast.daysToEmpty <= 3 ? 'Refuel review · soon' : 'Planning estimate'} tone={forecast.runsDryISO ? forecast.band : 'muted'} /></div><p>{forecast.runsDryISO ? String(forecast.daysToEmpty) + ' day(s), approximately ' + planningDate(forecast.runsDryISO) + ', at the recorded draw.' : 'No positive consumption rate is recorded; time to empty cannot be calculated.'}</p><p className={styles.metadata}>Manual planning estimate, not a live forecast.</p></div><dl className={styles.facts}><div><dt>Recorded consumption</dt><dd>{generator.litresPerHour} L/hr</dd></div><div><dt>Baseline comparison</dt><dd>{anomaly.deltaPct >= 0 ? '+' : ''}{anomaly.deltaPct}% <span className={styles.metadata}>{anomaly.anomalous ? '· inspect for a fault' : '· within recorded baseline'}</span></dd></div><div><dt>Runtime today</dt><dd>{generator.runtimeHoursToday} hours</dd></div><div><dt>Runtime this month</dt><dd>{generator.runtimeHoursMonth} hours</dd></div></dl>{canMutate ? <div className={styles.actions}><Button icon={<Fuel size={16} />} onClick={() => setRefuelFor(generator)}>Log refuel</Button></div> : <p className={styles.metadata}>Read-only energy records</p>}</div></Card>;
      })}</div> : <Card><EmptyState icon={<Fuel size={26} />} title="No generators in scope" description="Generator capacity, fuel level and service planning appear here when recorded." /></Card> },
      { id: 'meters', label: 'Meter readings', content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Meter readings" subtitle="Manual readings with a visible previous value and recording timestamp" /></div>{meters.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Energy meter register"><table className={'pb-data-table ' + styles.table}><thead><tr>{['Meter', 'Reading', 'Previous', 'Change', 'Recorded · WAT', 'Action'].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{meters.map((meter) => <tr key={meter.id}><td><p className={styles.rowTitle}>{meter.label}</p><p className={styles.metadata}>{meter.kind.replaceAll('_', ' ')}</p></td><td className={styles.numeric}>{meter.reading.toLocaleString('en-NG')} {meter.unit}</td><td className={styles.numeric}>{meter.previous.toLocaleString('en-NG')} {meter.unit}</td><td className={styles.numeric}>{meter.reading - meter.previous >= 0 ? '+' : ''}{(meter.reading - meter.previous).toLocaleString('en-NG')} {meter.unit}</td><td>{date(meter.atISO)}</td><td className={styles.action}>{canMutate ? <Button aria-label={'Log reading for ' + meter.label} onClick={() => setMeterFor(meter)}>Log reading</Button> : <span className={styles.metadata}>Read-only</span>}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<Droplet size={26} />} title="No meter readings" description="No manual or provider-confirmed readings are recorded in this scope." /></div>}<p className={styles.footer}>Reading changes update operational records only. They do not create a utility bill or authorise a provider payment.</p></Card> },
    ]} />
    {refuelFor ? <ReadingDialog title="Log refuel" label="Litres added" initial={String(Math.round(refuelFor.tankLitres * (1 - refuelFor.fuelPct / 100)))} detail={refuelFor.name + ' · tank ' + refuelFor.tankLitres + ' L · recorded fuel ' + refuelFor.fuelPct + '%'} onClose={() => setRefuelFor(null)} action={(value) => logRefuel(refuelFor.id, value)} onDone={() => { setRefuelFor(null); setFeedback('Refuel logged'); }} refuel /> : null}
    {meterFor ? <ReadingDialog title="Log meter reading" label={'New reading (' + meterFor.unit + ')'} initial={String(meterFor.reading)} detail={meterFor.label + ' · last ' + meterFor.reading.toLocaleString('en-NG') + ' ' + meterFor.unit} onClose={() => setMeterFor(null)} action={(value) => logMeterReading(meterFor.id, value)} onDone={() => { setMeterFor(null); setFeedback('Meter reading saved'); }} /> : null}
    {feedback ? <FacilityFeedback message={feedback} onDismiss={() => setFeedback(null)} /> : null}
  </div>;
}

function ReadingDialog({ title, label, initial, detail, onClose, action, onDone, refuel = false }: {
  title: string; label: string; initial: string; detail: string; onClose: () => void;
  action: (value: number) => Promise<{ ok: boolean; error?: string }>; onDone: () => void; refuel?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  function submit() {
    if (inFlight.current || !value) return;
    inFlight.current = true; setError(null);
    start(async () => {
      try { const result = await action(Number(value)); if (!result.ok) { setError(result.error ?? 'The record could not be updated.'); return; } router.refresh(); onDone(); }
      catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); }
      finally { inFlight.current = false; }
    });
  }
  return <FacilityDialog title={title} onClose={onClose} pending={pending}><form className={styles.stack} onSubmit={(event) => { event.preventDefault(); submit(); }}><p className={styles.body}>{detail}</p><label className={styles.field}><span>{label}</span><input className={layout.control} value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" required disabled={pending} autoFocus /></label>{refuel ? <div className={styles.notice}><dl className={styles.facts}><div><dt>Estimated diesel cost</dt><dd>{facilityMoney(dieselCost(Number(value || 0)))}</dd></div><div><dt>Calculated emissions</dt><dd>{co2Kg(Number(value || 0))} kg CO₂</dd></div></dl><p className={styles.metadata}>Confirm fuel was physically delivered. This records a refuel only; no supplier payment is made.</p></div> : null}{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !value}>{pending ? 'Saving…' : refuel ? 'Log refuel' : 'Save reading'}</Button></div></form></FacilityDialog>;
}
