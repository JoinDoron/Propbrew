'use client';

import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles, ShortletFeedback , ShortletDialog , ShortletReview, ShortletConfirm } from './reference-ui';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, TrendingUp, TrendingDown, Tag, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { ruleRateMinor, effectiveRate, type RuleType } from '@/domain/shortlet/operations';
import { addPricingRule, removePricingRule } from '@/server/actions/shortlet';
import { shortletMoney as money, shortletDate as fmt } from './shortlet-format';
import styles from './shortlet-commercial-polish.module.css';

export type RuleRow = { id: string; label: string; fromISO: string; toISO: string; type: RuleType; amountMinor?: number; pct?: number };
export type AptRow = { id: string; name: string; property: string; baseMinor: number; rules: RuleRow[] };

const TYPE_META: Record<RuleType, { icon: React.ReactNode; tone: Tone; label: string }> = {
  increase: { icon: <TrendingUp size={12} />, tone: 'success', label: 'Surcharge' },
  decrease: { icon: <TrendingDown size={12} />, tone: 'info', label: 'Discount' },
  fixed: { icon: <Tag size={12} />, tone: 'progress', label: 'Fixed' },
};

const PRESETS = [
  { label: 'December peak', type: 'increase' as RuleType, pct: 25, from: '2026-12-15', to: '2027-01-05' },
  { label: 'Weekend premium', type: 'increase' as RuleType, pct: 15, from: '2026-08-01', to: '2026-08-31' },
  { label: 'Low-season deal', type: 'decrease' as RuleType, pct: 15, from: '2026-09-01', to: '2026-09-30' },
];
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
function pricingPresets(currentDateISO?: string) {
  if (!currentDateISO) return PRESETS;
  return [
    { label: 'Peak-season uplift', type: 'increase' as RuleType, pct: 25, from: currentDateISO, to: addDays(currentDateISO, 29) },
    { label: 'Short-stay premium', type: 'increase' as RuleType, pct: 15, from: currentDateISO, to: addDays(currentDateISO, 6) },
    { label: '30-day discount', type: 'decrease' as RuleType, pct: 15, from: currentDateISO, to: addDays(currentDateISO, 29) },
  ];
}

export function PricingWorkspace({ apartments , canCreate = false, canUpdate = false, currentDateISO }: { apartments: AptRow[] ; canCreate?: boolean; canUpdate?: boolean; currentDateISO?: string }) {
  const [addFor, setAddFor] = useState<AptRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const flash = (message: string) => setToast(message);

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      {apartments.length === 0 && <Card><EmptyState title="No apartments to price" description="Apartment rates and rules appear for your current scope." /></Card>}
      <PageTabs label="Pricing sections" items={[
        {
          id: "rules", label: "Apartment rates & rules", content: <div className={styles.stack}>
            {apartments.map((a) => (
              <Card key={a.id} padded={false} className={styles.card}>
                <div className={styles.header}><CardHeader title={a.name} subtitle={`${a.property} · base ${money(a.baseMinor)} per night · NGN`} action={<Button type="button" variant="primary" icon={<Plus size={18} />} onClick={() => setAddFor(a)} disabled={!canCreate}>Add rule</Button>} /></div><div className={styles.body}>

                {a.rules.length === 0 ? (
                  <EmptyState title="No seasonal pricing rules" description={`The recorded base rate of ${money(a.baseMinor)} per night applies when no rule covers a date.`} />
                ) : (
                  <ul className={styles.list}>
                    {a.rules.map((r) => {
                      const m = TYPE_META[r.type];
                      const rate = ruleRateMinor(a.baseMinor, r);
                      return (
                        <li key={r.id} className={styles.rule}>
                          <div className={styles.ruleHeading}><span aria-hidden="true" className={styles.icon} style={{ background: `color-mix(in srgb, ${toneVar(m.tone)} 14%, transparent)`, color: toneVar(m.tone) }}>{m.icon}</span><div><p className={styles.rowTitle}>{r.label}</p><p className={styles.metadata}>{r.type === 'fixed' ? m.label : `${m.label} ${r.pct}%`}</p></div></div>
                          <dl className={styles.facts}><div><dt>From</dt><dd><time dateTime={r.fromISO}>{fmt(r.fromISO)}</time></dd></div><div><dt>Through, inclusive</dt><dd><time dateTime={r.toISO}>{fmt(r.toISO)}</time></dd></div><div><dt>Rule-calculated nightly rate</dt><dd>{money(rate)}</dd></div></dl>
                          <div className={styles.actions}>
                          <ShortletConfirm disabled={!canUpdate} title="Review pricing rule removal" label={`Remove ${r.label}`} description={`Remove ${r.label} for ${a.name}. Future recorded rate calculations will use remaining rules or the base price. Existing bookings are not repriced.`} action={() => removePricingRule(r.id)} onDone={() => { router.refresh(); flash('Pricing rule removed from the record.'); }} danger />
                          </div></li>
                      );
                    })}
                  </ul>
                )}
                <RateStrip apt={a} startISO={currentDateISO ?? '2026-08-01'} /></div>
              </Card>
            ))}
          </div>
        },
        {
          id: "guide", label: "Pricing guide", content: <div className={styles.stack}>
            <Card padded={false} className={styles.card}><div className={styles.header}><CardHeader title="Operator-controlled pricing" subtitle="Date-range rules · no automatic or AI-driven rate changes" /></div><div className={`${styles.body} ${styles.stack}`}><p className={styles.text}>Charge more during peak seasons and offer discounts when occupancy is low. Rules you set here override the base rate for matching dates. The first matching rule in the recorded order wins; rules are not added together.</p><div className={styles.notice}><Sparkles aria-hidden="true" size={18} /><div>Ranges include both dates and cover every calendar day, including weekdays. Preset names do not apply weekday restrictions. Review the range, exact NGN amount and percentage before confirming.</div></div><p className={styles.metadata}>This updates workspace rate calculations only. Existing bookings are not repriced and no external channel price is published by this form.</p></div></Card>
          </div>
        }
      ]} />

      {canCreate && addFor && <AddRuleDialog apt={addFor} currentDateISO={currentDateISO} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); flash('Pricing rule added'); }} />}

      {toast && <ShortletFeedback message={toast} onClose={() => setToast(null)} />}

    </div>
  );
}

/** A little 30-night effective-rate sparkline — where rules bite. */
function RateStrip({ apt, startISO }: { apt: AptRow; startISO: string }) {
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${startISO}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { ...effectiveRate(apt.baseMinor, apt.rules, iso), iso };
  }), [apt, startISO]);
  const max = Math.max(...days.map((d) => d.minor), apt.baseMinor);
  const min = Math.min(...days.map((d) => d.minor), apt.baseMinor);
  const actualMin = Math.min(...days.map((day) => day.minor));
  const actualMax = Math.max(...days.map((day) => day.minor));
  return (
    <section className={styles.rateSection}>
      <h4>Effective rate illustration · {fmt(days[0].iso)}–{fmt(days[29].iso)}</h4>
      <p className={styles.metadata}>Recorded rule calculation, not a demand forecast or live channel quote. {actualMax === actualMin ? `All 30 nights use ${money(actualMin)} per night.` : `Range: ${money(actualMin)} – ${money(actualMax)} per night.`}</p>
      <div className={styles.scroll} role="region" aria-label={`${apt.name} effective nightly rate illustration, horizontally scrollable`} tabIndex={0}><div className={styles.rateChart} role="img" aria-label={days.map((day) => `${fmt(day.iso)}: ${money(day.minor)}, ${day.rule ? 'matching rule' : 'base rate'}`).join('; ')}>
        {days.map((d, i) => (
          <span key={i} style={{ height: `${max === min ? 50 : ((d.minor - min) / (max - min)) * 100 || 4}%`, minHeight: 3, background: d.rule ? toneVar(d.rule.type === 'decrease' ? 'info' : 'success') : 'var(--text-3)' }} />
        ))}
      </div></div><p className={styles.metadata}>Bars use a relative scale. Exact dates, prices and applied rule names are available below.</p><details><summary className={styles.disclosure}>View all 30 nightly rate calculations</summary><ul className={styles.rateDays}>{days.map((day) => <li key={day.iso}><time dateTime={day.iso}>{fmt(day.iso)}</time><strong>{money(day.minor)}</strong><span>{day.rule ? apt.rules.find((rule) => rule === day.rule)?.label ?? 'Matching pricing rule' : 'Base rate'}</span></li>)}</ul></details>
    </section>
  );
}

function AddRuleDialog({ apt, currentDateISO, onClose, onDone }: { apt: AptRow; currentDateISO?: string; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(''); const [from, setFrom] = useState(currentDateISO ?? '2026-12-15'); const [to, setTo] = useState(currentDateISO ? addDays(currentDateISO, 29) : '2027-01-05');
  const [type, setType] = useState<RuleType>('increase'); const [pct, setPct] = useState('20'); const [amount, setAmount] = useState((apt.baseMinor / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);

  const preview = ruleRateMinor(apt.baseMinor, { type, amountMinor: Math.round(Number(amount) * 100), pct: Number(pct) });
  const valid = Boolean(label.trim() && from && to && Date.parse(to) >= Date.parse(from) && Number.isFinite(preview) && preview >= 0 && (type === 'fixed' ? amount && Number(amount) > 0 : pct && Number(pct) >= 0 && (type !== 'decrease' || Number(pct) <= 100)));
  const applyPreset = (p: (typeof PRESETS)[number]) => { setLabel(p.label); setType(p.type); setPct(String(p.pct)); setFrom(p.from); setTo(p.to); };
  function submit() { if (pending || inFlight.current || !valid || !form.current?.reportValidity()) return;
    inFlight.current = true;
    setError(null);
    start(async () => { try {
      const r = await addPricingRule({ apartmentId: apt.id, label, fromISO: from, toISO: to, type, amountNaira: Number(amount), pct: Number(pct) });
      if (!r.ok) { setError(r.error); return; }
      router.refresh(); onDone();
     } catch { setError('Unable to save this record. Please try again.'); } finally { inFlight.current = false; } });
  }
  return (
    <ShortletDialog title="New pricing rule" onClose={onClose} pending={pending} wide><p className={styles.text}>{apt.name} · {apt.property} · base {money(apt.baseMinor)} per night</p>
      <form ref={form} className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <fieldset><legend className={styles.rowTitle}>Start from a date-range template</legend><div className={`${styles.actions} mt-3`}>{pricingPresets(currentDateISO).map((preset) => <Button type="button" key={preset.label} onClick={() => applyPreset(preset)} icon={<Sparkles aria-hidden="true" size={16} />}>{preset.label}</Button>)}</div><p className={`${styles.metadata} mt-3`}>Templates cover every day in their range, including weekdays. Review and adjust before saving.</p></fieldset>
        <label className={styles.field}><span>Rule label</span><input aria-label="Label" required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Christmas surcharge" autoFocus /></label>
        <div className={styles.formGrid}><label className={styles.field}><span>From, inclusive</span><input aria-label="From" required type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label className={styles.field}><span>Through, inclusive</span><input aria-label="To" required type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label></div>
        <fieldset><legend className={styles.rowTitle}>Rate adjustment</legend><div className={`${styles.actions} mt-3`}>{(['fixed', 'increase', 'decrease'] as RuleType[]).map((value) => <Button type="button" key={value} aria-pressed={type === value} variant={type === value ? 'primary' : 'secondary'} onClick={() => setType(value)}>{value === 'fixed' ? 'Fixed' : value === 'increase' ? 'Increase' : 'Decrease'}</Button>)}</div></fieldset>
        {type === 'fixed' ? <label className={styles.field}><span>Fixed nightly rate (₦)</span><input aria-label="Fixed nightly rate (₦)" required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label> : <label className={styles.field}><span>Percent (%)</span><input aria-label="Percent (%)" required type="number" min="0" max={type === 'decrease' ? 100 : undefined} step="0.01" inputMode="decimal" value={pct} onChange={(event) => setPct(event.target.value)} /></label>}
        <div className={styles.notice}><Sparkles aria-hidden="true" size={18} /><div>Proposed recorded rate: <strong>{Number.isFinite(preview) ? money(preview) : 'Enter a valid amount'} per night</strong> for {fmt(from)} – {fmt(to)}. This is a rule calculation, not an AI recommendation.</div></div>
      </form>{error && <p role="alert" className={styles.error}>{error}</p>}<ShortletReview pending={pending} disabled={!valid} onCancel={onClose} onSubmit={submit} label="Confirm add rule">Review the exact dates and nightly rate above. This records a workspace change only; existing bookings are not repriced and external channels are not updated.</ShortletReview></ShortletDialog>
  );
}
