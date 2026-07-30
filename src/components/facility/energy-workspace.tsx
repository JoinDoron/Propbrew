'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Fuel, Gauge, Leaf, Zap, AlertTriangle, Droplet, X, Sparkles, Plug, TrendingUp } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { refuelForecast, fuelAnomaly, dieselCost, co2Kg, type Generator } from '@/domain/facility';
import { logRefuel, logMeterReading } from '@/server/actions/facility';

export type GenRow = Generator & { siteName: string };
export type MeterRow = { id: string; label: string; kind: string; unit: string; reading: number; previous: number; atISO: string };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;
const GEN_STATUS_TONE: Record<string, Tone> = { running: 'success', standby: 'info', fault: 'danger' };

export function EnergyWorkspace({ generators, meters, kpis, reliance, nowMs }: { generators: GenRow[]; meters: MeterRow[]; kpis: { dieselSpendMinor: number; litresMonth: number; costPerKwhMinor: number; co2Kg: number }; reliance: { gensetPct: number; gridPct: number }; nowMs: number }) {
  const [refuelFor, setRefuelFor] = useState<GenRow | null>(null);
  const [meterFor, setMeterFor] = useState<MeterRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Diesel spend" value={money(kpis.dieselSpendMinor)} note={`${kpis.litresMonth.toLocaleString()} L this month`} tone="danger" icon={<Fuel size={16} />} />
        <Kpi label="Genset reliance" value={`${reliance.gensetPct}%`} note={`${reliance.gridPct}% grid`} tone={reliance.gensetPct > 60 ? 'warn' : 'success'} icon={<Zap size={16} />} />
        <Kpi label="Cost / kWh" value={money(kpis.costPerKwhMinor)} note="genset, diesel" tone="progress" icon={<Gauge size={16} />} />
        <Kpi label="Carbon" value={`${(kpis.co2Kg / 1000).toFixed(1)}t`} note="CO₂ this month" tone="neutral" icon={<Leaf size={16} />} />
      </div>

      {/* Grid vs genset reliance */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-2"><Plug size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Power source split · last 30 days</span></div>
        <div className="h-3 rounded-full overflow-hidden flex bg-surface-2">
          <div className="h-full" style={{ width: `${reliance.gensetPct}%`, background: toneVar('warn') }} />
          <div className="h-full" style={{ width: `${reliance.gridPct}%`, background: toneVar('success') }} />
        </div>
        <div className="flex gap-4 mt-2 text-[11px] text-text-3">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar('warn') }} /> Generator {reliance.gensetPct}%</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar('success') }} /> Grid {reliance.gridPct}%</span>
        </div>
      </div>

      {/* Generators */}
      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3">
        {generators.map((g) => {
          const f = refuelForecast(g, nowMs);
          const anom = fuelAnomaly(g);
          return (
            <div key={g.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-[14px] font-semibold">{g.name}</div><div className="text-[11.5px] text-text-3">{g.siteName} · {g.capacityKva}kVA</div></div>
                <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(GEN_STATUS_TONE[g.status])} 14%, transparent)`, color: toneVar(GEN_STATUS_TONE[g.status]) }}>{g.status}</span>
              </div>

              {/* fuel gauge */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-2 inline-flex items-center gap-1"><Fuel size={11} /> Fuel</span><span className="font-mono font-semibold">{g.fuelPct}% · {f.litresRemaining}L</span></div>
                <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${g.fuelPct}%`, background: toneVar(f.band) }} /></div>
              </div>

              {/* refuel forecast */}
              <div className="mt-3 rounded-xl p-2.5 flex items-center gap-2" style={{ background: `color-mix(in srgb, ${toneVar(f.band)} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(f.band)} 28%, transparent)` }}>
                <Sparkles size={14} style={{ color: toneVar(f.band) }} className="flex-none" />
                <div className="text-[11.5px]">{f.runsDryISO ? <>Runs dry in <b>{f.daysToEmpty} day{f.daysToEmpty === 1 ? '' : 's'}</b> (~{f.runsDryISO.slice(5)}) at current draw</> : 'On standby — no active draw'}</div>
              </div>

              {/* efficiency + anomaly */}
              <div className="flex items-center gap-3 mt-2.5 text-[11.5px]">
                <span className="text-text-3">{g.litresPerHour} L/hr</span>
                {anom.anomalous ? <span className="inline-flex items-center gap-1 font-medium text-negative"><AlertTriangle size={12} /> +{anom.deltaPct}% vs baseline · check for fault</span> : <span className="text-positive">efficient ({anom.deltaPct >= 0 ? '+' : ''}{anom.deltaPct}% vs baseline)</span>}
                <span className="ml-auto text-text-3">{g.runtimeHoursToday}h today · {g.runtimeHoursMonth}h/mo</span>
              </div>
              <button onClick={() => setRefuelFor(g)} className="mt-3 h-8 px-3 rounded-lg border border-border-2 text-[12px] font-medium inline-flex items-center gap-1.5"><Fuel size={13} /> Log refuel</button>
            </div>
          );
        })}
      </div>

      {/* Meters */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><TrendingUp size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Meter readings</span></div>
        <div className="divide-y divide-border">
          {meters.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(m.kind === 'water' ? 'info' : m.kind === 'grid' ? 'success' : 'warn')} 13%, transparent)`, color: toneVar(m.kind === 'water' ? 'info' : m.kind === 'grid' ? 'success' : 'warn') }}>{m.kind === 'water' ? <Droplet size={15} /> : <Zap size={15} />}</span>
              <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{m.label}</div><div className="text-[11px] text-text-3">+{(m.reading - m.previous).toLocaleString()} {m.unit} since last · read {m.atISO.slice(5)}</div></div>
              <div className="text-right flex-none"><div className="text-[13px] font-mono font-semibold">{m.reading.toLocaleString()}</div><div className="text-[10px] text-text-3">{m.unit}</div></div>
              <button onClick={() => setMeterFor(m)} className="h-8 px-3 rounded-lg border border-border-2 text-[12px] font-medium flex-none">Read</button>
            </div>
          ))}
        </div>
      </div>

      {refuelFor && <RefuelDialog gen={refuelFor} onClose={() => setRefuelFor(null)} onDone={() => { setRefuelFor(null); flash('Refuel logged'); }} />}
      {meterFor && <MeterDialog meter={meterFor} onClose={() => setMeterFor(null)} onDone={() => { setMeterFor(null); flash('Meter reading saved'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function RefuelDialog({ gen, onClose, onDone }: { gen: GenRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [litres, setLitres] = useState(String(Math.round(gen.tankLitres * (1 - gen.fuelPct / 100))));
  const [error, setError] = useState<string | null>(null);
  const cost = dieselCost(Number(litres || 0));
  const co2 = co2Kg(Number(litres || 0));
  function submit() { setError(null); start(async () => { const r = await logRefuel(gen.id, Number(litres)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <Modal title="Log refuel" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{gen.name}</div><div className="text-text-3">Tank {gen.tankLitres}L · currently {gen.fuelPct}%</div></div>
      <label className="lble">Litres added</label><input value={litres} onChange={(e) => setLitres(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpe" autoFocus />
      <div className="mt-2 rounded-lg bg-surface-2 p-2.5 text-[11.5px] flex items-center justify-between"><span>Diesel cost ≈ <b>{money(cost)}</b></span><span className="text-text-3">{co2}kg CO₂</span></div>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions onClose={onClose} onSubmit={submit} pending={pending} disabled={!litres} label="Log refuel" />
    </Modal>
  );
}
function MeterDialog({ meter, onClose, onDone }: { meter: MeterRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(String(meter.reading));
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await logMeterReading(meter.id, Number(reading)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <Modal title="Log meter reading" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{meter.label}</div><div className="text-text-3">Last {meter.reading.toLocaleString()} {meter.unit}</div></div>
      <label className="lble">New reading ({meter.unit})</label><input value={reading} onChange={(e) => setReading(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpe" autoFocus />
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions onClose={onClose} onSubmit={submit} pending={pending} disabled={!reading} label="Save reading" />
    </Modal>
  );
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        {children}
        <style>{`.lble{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpe{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpe:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Actions({ onClose, onSubmit, pending, disabled, label }: { onClose: () => void; onSubmit: () => void; pending: boolean; disabled?: boolean; label: string }) {
  return <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={onSubmit} disabled={pending || disabled} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : label}</button></div>;
}
function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div><div className="text-[10.5px] mt-1" style={{ color: toneVar(tone) }}>{note}</div></div>;
}
