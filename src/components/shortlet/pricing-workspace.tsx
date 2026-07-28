'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, TrendingUp, TrendingDown, Tag, Trash2, Sparkles, CalendarRange } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { ruleRateMinor, effectiveRate, type RuleType } from '@/domain/shortlet/operations';
import { addPricingRule, removePricingRule } from '@/server/actions/shortlet';

export type RuleRow = { id: string; label: string; fromISO: string; toISO: string; type: RuleType; amountMinor?: number; pct?: number };
export type AptRow = { id: string; name: string; property: string; baseMinor: number; rules: RuleRow[] };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
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

export function PricingWorkspace({ apartments }: { apartments: AptRow[] }) {
  const [addFor, setAddFor] = useState<AptRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const remove = (id: string) => start(async () => { const r = await removePricingRule(id); if (r.ok) { router.refresh(); flash('Rule removed'); } });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-xl px-4 py-2.5 text-[12px] flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)' }}>
        <Sparkles size={14} className="text-primary flex-none" /> Charge more during peak seasons and offer discounts when occupancy is low. Rules you set here override the base rate for those dates — you always stay in control.
      </div>

      {apartments.map((a) => (
        <div key={a.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div><div className="text-[14px] font-semibold">{a.name}</div><div className="text-[11.5px] text-text-3">{a.property} · base {money(a.baseMinor)}/night</div></div>
            <button onClick={() => setAddFor(a)} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium"><Plus size={14} /> Add rule</button>
          </div>

          {a.rules.length === 0 ? (
            <p className="text-[11.5px] text-text-3 mt-2.5">No seasonal rules — the base rate applies year-round.</p>
          ) : (
            <div className="flex flex-col gap-1.5 mt-3">
              {a.rules.map((r) => {
                const m = TYPE_META[r.type];
                const rate = ruleRateMinor(a.baseMinor, r);
                return (
                  <div key={r.id} className="flex items-center gap-2.5 rounded-xl border border-border p-2.5">
                    <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(m.tone)} 14%, transparent)`, color: toneVar(m.tone) }}>{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium truncate">{r.label} <span className="text-text-3 font-normal">· {r.type === 'fixed' ? m.label : `${m.label} ${r.pct}%`}</span></div>
                      <div className="text-[10.5px] text-text-3 flex items-center gap-1"><CalendarRange size={10} /> {fmt(r.fromISO)} – {fmt(r.toISO)}</div>
                    </div>
                    <span className="text-[12.5px] font-mono font-semibold flex-none">{money(rate)}<span className="text-[9px] text-text-3">/nt</span></span>
                    <button disabled={pending} onClick={() => remove(r.id)} className="w-7 h-7 rounded-lg grid place-items-center text-text-3 hover:text-negative flex-none" aria-label="Remove"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          <RateStrip apt={a} />
        </div>
      ))}

      {addFor && <AddRuleDialog apt={addFor} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); flash('Pricing rule added'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

/** A little 30-night effective-rate sparkline — where rules bite. */
function RateStrip({ apt }: { apt: AptRow }) {
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2026-08-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return effectiveRate(apt.baseMinor, apt.rules, iso);
  }), [apt]);
  const max = Math.max(...days.map((d) => d.minor), apt.baseMinor);
  const min = Math.min(...days.map((d) => d.minor), apt.baseMinor);
  if (max === min) return null;
  return (
    <div className="mt-3">
      <div className="text-[9.5px] text-text-3 uppercase tracking-wide mb-1">Effective rate · next 30 nights (from Aug)</div>
      <div className="flex items-end gap-px h-8">
        {days.map((d, i) => (
          <div key={i} className="flex-1 rounded-t" style={{ height: `${((d.minor - min) / (max - min)) * 100 || 4}%`, minHeight: 3, background: d.rule ? toneVar(d.rule.type === 'decrease' ? 'info' : 'success') : 'var(--surface-3)' }} title={money(d.minor)} />
        ))}
      </div>
    </div>
  );
}

function AddRuleDialog({ apt, onClose, onDone }: { apt: AptRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(''); const [from, setFrom] = useState('2026-12-15'); const [to, setTo] = useState('2027-01-05');
  const [type, setType] = useState<RuleType>('increase'); const [pct, setPct] = useState('20'); const [amount, setAmount] = useState(String(Math.round(apt.baseMinor / 100)));
  const [error, setError] = useState<string | null>(null);

  const preview = ruleRateMinor(apt.baseMinor, { type, amountMinor: Math.round(Number(amount) * 100), pct: Number(pct) });
  const applyPreset = (p: (typeof PRESETS)[number]) => { setLabel(p.label); setType(p.type); setPct(String(p.pct)); setFrom(p.from); setTo(p.to); };
  function submit() {
    setError(null);
    start(async () => {
      const r = await addPricingRule({ apartmentId: apt.id, label, fromISO: from, toISO: to, type, amountNaira: Number(amount), pct: Number(pct) });
      if (!r.ok) { setError(r.error); return; }
      router.refresh(); onDone();
    });
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[440px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1"><h3 className="text-[15px] font-semibold">New pricing rule</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <p className="text-[11.5px] text-text-3 mb-3">{apt.name} · base {money(apt.baseMinor)}/night</p>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {PRESETS.map((p) => <button key={p.label} onClick={() => applyPreset(p)} className="text-[11px] px-2.5 h-7 rounded-full border border-border-2 hover:border-primary hover:text-primary inline-flex items-center gap-1"><Sparkles size={11} /> {p.label}</button>)}
        </div>
        <label className="lblp">Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Christmas surcharge" className="inpp mb-2" autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <div><label className="lblp">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inpp" /></div>
          <div><label className="lblp">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inpp" /></div>
        </div>
        <label className="lblp mt-2">Type</label>
        <div className="inline-flex rounded-lg border border-border-2 overflow-hidden mb-2">
          {(['fixed', 'increase', 'decrease'] as RuleType[]).map((t) => <button key={t} onClick={() => setType(t)} className={`text-[11.5px] px-3 h-8 capitalize ${type === t ? 'bg-primary text-white' : 'text-text-3'}`}>{t === 'fixed' ? 'Fixed' : t === 'increase' ? '↑ Increase' : '↓ Decrease'}</button>)}
        </div>
        {type === 'fixed' ? (
          <div><label className="lblp">Fixed nightly rate (₦)</label><input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpp" /></div>
        ) : (
          <div><label className="lblp">Percent (%)</label><input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpp" /></div>
        )}
        <div className="mt-3 rounded-xl p-3 flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)' }}><Sparkles size={13} className="text-primary" /><div className="text-[12px]">Guests pay <b>{money(preview)}/night</b> during this period.</div></div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-3.5"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !label.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Adding…' : 'Add rule'}</button></div>
        <style>{`.lblp{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpp{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpp:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
