'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, ArrowUpDown, Droplet, Wind, Flame, DoorOpen, Radio, Thermometer, Fuel, Users, Plug, AlertTriangle, ShieldCheck, Check, Send, Gauge } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { acknowledgeAlarm, dispatchWoFromAlarm } from '@/server/actions/facility';

export type SystemRow = { id: string; name: string; category: string; status: string; detail: string; siteName: string };
export type SensorRow = { id: string; name: string; kind: string; value: number; unit: string; low?: number; high?: number; drift?: number; text?: string; siteName: string };
export type AlarmRow = { id: string; system: string; severity: string; message: string; atISO: string; acknowledged: boolean; woRef?: string };
export type Health = { score: number; band: Tone; label: string };

const STATUS_TONE: Record<string, Tone> = { operational: 'success', standby: 'info', degraded: 'warn', down: 'danger' };
const CAT_ICON: Record<string, React.ReactNode> = { power: <Zap size={15} />, vertical_transport: <ArrowUpDown size={15} />, water: <Droplet size={15} />, hvac: <Wind size={15} />, safety: <Flame size={15} />, access: <DoorOpen size={15} /> };
const SENSOR_ICON: Record<string, React.ReactNode> = { water_tank: <Droplet size={15} />, temperature: <Thermometer size={15} />, fuel: <Fuel size={15} />, power_source: <Plug size={15} />, occupancy: <Users size={15} /> };
const SEV_TONE: Record<string, Tone> = { critical: 'danger', warning: 'warn', info: 'info' };

function ago(iso: string, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ControlCenter({ health, systems, sensors, alarms, kpis, nowMs }: { health: Health; systems: SystemRow[]; sensors: SensorRow[]; alarms: AlarmRow[]; kpis: { operational: number; total: number; powerSource: string; waterPct: number }; nowMs: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  const clockMs = nowMs + tick * 2000;

  const ack = (id: string) => start(async () => { const r = await acknowledgeAlarm(id); if (r.ok) { router.refresh(); flash('Alarm acknowledged'); } else flash(r.error); });
  const dispatch = (id: string) => start(async () => { const r = await dispatchWoFromAlarm(id); if (r.ok) { router.refresh(); flash(`Dispatched ${r.ref} to the field team`); } else flash(r.error); });

  // deterministic live drift for the sensor readout
  const live = (s: SensorRow) => { if (!s.drift) return s.value; const osc = Math.sin(tick / 2.5 + s.id.charCodeAt(s.id.length - 1)) * s.drift; return Math.round((s.value + osc) * 10) / 10; };
  const open = alarms.filter((a) => !a.acknowledged);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg, #0b1220 0%, #14243d 55%, #0e3a53 100%)' }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${toneVar(health.band)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-5 flex-wrap">
          <HealthRing score={health.score} band={health.band} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-white/70"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34d399] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#34d399]" /></span> LIVE · updated {ago(new Date(clockMs).toISOString(), clockMs)}</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] leading-tight mt-1">Estate operations · <span style={{ color: toneVar(health.band) }}>{health.label}</span></div>
            <div className="text-[12.5px] text-white/70 mt-0.5">{kpis.operational}/{kpis.total} systems healthy · {open.length} open alarm{open.length === 1 ? '' : 's'}</div>
          </div>
          <div className="ml-auto flex gap-4">
            <HeroStat icon={<Plug size={15} />} label="Power" value={kpis.powerSource} />
            <HeroStat icon={<Droplet size={15} />} label="Water tank" value={`${kpis.waterPct}%`} />
            <HeroStat icon={<AlertTriangle size={15} />} label="Alarms" value={String(open.length)} />
          </div>
        </div>
      </div>

      {/* Live sensors */}
      <div className="grid grid-cols-2 min-[720px]:grid-cols-5 gap-2.5">
        {sensors.map((s) => {
          const v = live(s);
          const breach = (s.low !== undefined && v < s.low) || (s.high !== undefined && v > s.high);
          const tone: Tone = breach ? 'danger' : 'success';
          return (
            <div key={s.id} className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
              <div className="flex items-center justify-between"><span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{SENSOR_ICON[s.kind]}</span><Radio size={11} className="text-text-3 animate-pulse" /></div>
              <div className="text-[18px] font-bold tracking-[-0.02em] mt-2 tabular-nums">{s.text ?? `${v}${s.unit}`}</div>
              <div className="text-[10.5px] text-text-3 truncate">{s.name}</div>
              {(s.kind === 'water_tank' || s.kind === 'fuel' || s.kind === 'occupancy') && <div className="h-1 rounded-full bg-surface-2 overflow-hidden mt-1.5"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, v)}%`, background: toneVar(tone) }} /></div>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_340px] gap-3.5 items-start">
        {/* Systems grid */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Gauge size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Building systems</span><span className="ml-auto text-[11px] text-text-3">{kpis.operational}/{kpis.total} healthy</span></div>
          <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-px bg-border">
            {systems.map((s) => {
              const t = STATUS_TONE[s.status] ?? 'neutral';
              const alert = s.status === 'down' || s.status === 'degraded';
              return (
                <div key={s.id} className="bg-surface p-3 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(t)} 13%, transparent)`, color: toneVar(t) }}>{CAT_ICON[s.category] ?? <Zap size={15} />}</span>
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{s.name}</div><div className="text-[10.5px] text-text-3 truncate">{s.detail}</div></div>
                  <span className="relative flex h-2.5 w-2.5 flex-none">{alert && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: toneVar(t) }} />}<span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: toneVar(t) }} /></span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alarms */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><AlertTriangle size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Active alarms</span><span className="ml-auto text-[11px]" style={{ color: toneVar(open.length ? 'danger' : 'success') }}>{open.length ? `${open.length} open` : 'all clear'}</span></div>
          {alarms.length === 0 ? <p className="text-[12.5px] text-text-3 px-4 py-4 flex items-center gap-1.5"><ShieldCheck size={14} className="text-positive" /> No alarms.</p> : (
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {alarms.map((a) => (
                <div key={a.id} className={`px-4 py-3 ${a.acknowledged ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full mt-1.5 flex-none" style={{ background: toneVar(SEV_TONE[a.severity]) }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium">{a.system}</div>
                      <div className="text-[11.5px] text-text-3">{a.message}</div>
                      <div className="text-[10px] text-text-3 mt-0.5">{ago(a.atISO, clockMs)}{a.woRef && <> · dispatched <span className="font-mono text-primary">{a.woRef}</span></>}</div>
                    </div>
                  </div>
                  {!a.acknowledged && (
                    <div className="flex gap-1.5 mt-2 pl-4">
                      <button disabled={pending} onClick={() => dispatch(a.id)} className="text-[11px] px-2.5 h-7 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Send size={11} /> Dispatch WO</button>
                      <button disabled={pending} onClick={() => ack(a.id)} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2 text-text-2 inline-flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Ack</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function HealthRing({ score, band }: { score: number; band: Tone }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span><span className="text-[8px] text-white/60 uppercase tracking-wide">health</span></div>
    </div>
  );
}
function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="text-right"><div className="flex items-center justify-end gap-1 text-white/60 text-[11px]">{icon}{label}</div><div className="text-[16px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
