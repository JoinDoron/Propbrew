'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen, DoorClosed, ShieldAlert, Users, LogIn, LogOut, UserPlus, ScanLine, Car, Package, Truck, User, Lock, LockOpen, Radio, X, Siren } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { accessPointTone, isOverstay, type AccessPoint, type VisitorPass, type AccessEvent } from '@/domain/facility';
import { preRegisterVisitor, checkInVisitor, checkOutVisitor, setAccessPointMode, setEstateLockdown, type PreRegisterInput } from '@/server/actions/facility';

const KIND_ICON: Record<VisitorPass['kind'], React.ReactNode> = { guest: <User size={13} />, contractor: <Truck size={13} />, delivery: <Package size={13} />, ride_hail: <Car size={13} /> };
const KIND_LABEL: Record<VisitorPass['kind'], string> = { guest: 'Guest', contractor: 'Contractor', delivery: 'Delivery', ride_hail: 'Ride' };
const V_STATUS_TONE: Record<VisitorPass['status'], Tone> = { expected: 'info', checked_in: 'progress', checked_out: 'muted', denied: 'danger' };
const EVENT_TONE: Record<AccessEvent['kind'], Tone> = { entry: 'success', exit: 'muted', denied: 'danger', forced: 'danger', held: 'warn' };
const POINT_ICON: Record<AccessPoint['kind'], React.ReactNode> = { gate: <DoorOpen size={15} />, door: <DoorClosed size={15} />, turnstile: <Users size={15} />, barrier: <Car size={15} /> };

function ago(iso: string, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AccessWorkspace({ points, passes, events, kpis, nowMs }: {
  points: AccessPoint[]; passes: VisitorPass[]; events: AccessEvent[];
  kpis: { onSite: number; expectedToday: number; online: number; totalPoints: number; threats: number }; nowMs: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [showReg, setShowReg] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  const clockMs = nowMs + tick * 2000;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const lockedDown = points.length > 0 && points.every((p) => p.mode === 'lockdown');
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  const expected = passes.filter((p) => p.status === 'expected');
  const onSite = passes.filter((p) => p.status === 'checked_in');
  const recent = passes.filter((p) => p.status === 'checked_out' || p.status === 'denied').slice(0, 4);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero with lockdown */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-card" style={{ background: lockedDown ? 'linear-gradient(135deg,#3b0d12 0%,#611620 60%,#7f1d2b 100%)' : 'linear-gradient(135deg,#0b1220 0%,#14243d 55%,#123a2f 100%)' }}>
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-white/70"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34d399] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#34d399]" /></span> LIVE · perimeter {lockedDown ? 'LOCKED DOWN' : 'secured'}</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-1">{kpis.onSite} visitor{kpis.onSite === 1 ? '' : 's'} on site · {kpis.online}/{kpis.totalPoints} points online</div>
            <div className="text-[12px] text-white/70 mt-0.5">{kpis.expectedToday} expected today{kpis.threats > 0 && <> · <span className="text-[#fca5a5] font-medium">{kpis.threats} need attention</span></>}</div>
          </div>
          <button onClick={() => act(() => setEstateLockdown(!lockedDown), lockedDown ? 'Lockdown released' : 'Estate locked down')} disabled={pending}
            className="ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl font-semibold text-[13px] disabled:opacity-60 transition-colors"
            style={{ background: lockedDown ? '#fff' : 'rgba(255,255,255,.12)', color: lockedDown ? '#7f1d2b' : '#fff', border: '1px solid rgba(255,255,255,.25)' }}>
            <Siren size={15} /> {lockedDown ? 'Release lockdown' : 'Lock down estate'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="On site now" value={String(kpis.onSite)} tone="progress" icon={<Users size={16} />} />
        <Kpi label="Expected today" value={String(kpis.expectedToday)} tone="info" icon={<UserPlus size={16} />} />
        <Kpi label="Points online" value={`${kpis.online}/${kpis.totalPoints}`} tone={kpis.online === kpis.totalPoints ? 'success' : 'warn'} icon={<DoorClosed size={16} />} />
        <Kpi label="Need attention" value={String(kpis.threats)} tone={kpis.threats ? 'danger' : 'success'} icon={<ShieldAlert size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        <div className="flex flex-col gap-3.5">
          {/* Access points */}
          <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><DoorClosed size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Access points</span></div>
            <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-px bg-border">
              {points.map((p) => {
                const tone = accessPointTone(p);
                const label = p.mode === 'lockdown' ? 'lockdown' : p.status === 'held_open' ? 'held open' : p.status === 'forced' ? 'forced!' : p.status === 'offline' ? 'offline' : p.mode;
                return (
                  <div key={p.id} className="bg-surface p-3 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 13%, transparent)`, color: toneVar(tone) }}>{POINT_ICON[p.kind]}</span>
                    <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{p.name}</div><div className="text-[10.5px] text-text-3 capitalize flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: toneVar(tone) }} />{label}{p.batteryPct !== undefined && p.batteryPct < 20 && <span className="text-negative"> · battery {p.batteryPct}%</span>}</div></div>
                    {p.mode !== 'lockdown' && p.status !== 'offline' && (
                      <button disabled={pending} onClick={() => act(() => setAccessPointMode(p.id, p.mode === 'unlocked' ? 'secured' : 'unlocked'), p.mode === 'unlocked' ? 'Secured' : 'Unlocked')} title={p.mode === 'unlocked' ? 'Secure' : 'Unlock'} className="w-8 h-8 rounded-lg grid place-items-center border border-border-2 flex-none disabled:opacity-50">{p.mode === 'unlocked' ? <LockOpen size={13} /> : <Lock size={13} />}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Visitor passes */}
          <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Users size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Visitor passes</span>
              <button onClick={() => setShowReg(true)} className="ml-auto text-[11.5px] px-2.5 h-7 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1"><UserPlus size={12} /> Pre-register</button>
            </div>
            <div className="divide-y divide-border">
              {[...expected, ...onSite, ...recent].map((p) => {
                const overstay = isOverstay(p, clockMs);
                return (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3" style={overstay ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
                    <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(V_STATUS_TONE[p.status])} 13%, transparent)`, color: toneVar(V_STATUS_TONE[p.status]) }}>{KIND_ICON[p.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium flex items-center gap-1.5 truncate">{p.visitorName} <span className="font-mono text-[10px] text-text-3">{p.code}</span>{overstay && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 14%, transparent)`, color: toneVar('danger') }}>overstay</span>}</div>
                      <div className="text-[10.5px] text-text-3 truncate">{KIND_LABEL[p.kind]} · {p.hostUnit} · {p.purpose}{p.vehiclePlate ? ` · ${p.vehiclePlate}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      {p.status === 'expected' && <button disabled={pending} onClick={() => act(() => checkInVisitor(p.id), 'Checked in')} className="text-[11px] px-2.5 h-7 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><LogIn size={11} /> Check in</button>}
                      {p.status === 'checked_in' && <button disabled={pending} onClick={() => act(() => checkOutVisitor(p.id), 'Checked out')} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2 text-text-2 font-medium inline-flex items-center gap-1 disabled:opacity-50"><LogOut size={11} /> Check out</button>}
                      {(p.status === 'checked_out' || p.status === 'denied') && <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(V_STATUS_TONE[p.status])} 14%, transparent)`, color: toneVar(V_STATUS_TONE[p.status]) }}>{p.status.replace('_', ' ')}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Live access feed */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><ScanLine size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Live gate feed</span><Radio size={11} className="text-text-3 animate-pulse ml-auto" /></div>
          <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="px-4 py-2.5 flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full mt-1.5 flex-none" style={{ background: toneVar(EVENT_TONE[e.kind]) }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium capitalize">{e.kind === 'forced' ? 'Forced entry' : e.kind === 'held' ? 'Held / manual' : e.kind} · <span className="text-text-2 font-normal">{e.pointName}</span></div>
                  <div className="text-[10.5px] text-text-3 truncate">{e.subjectName} · {e.credential}{e.passCode ? ` · ${e.passCode}` : ''}</div>
                  <div className="text-[9.5px] text-text-3 mt-0.5">{ago(e.atISO, clockMs)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showReg && <PreRegisterDialog onClose={() => setShowReg(false)} onDone={(code) => { setShowReg(false); flash(`Pass issued · ${code}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function PreRegisterDialog({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<PreRegisterInput>({ visitorName: '', kind: 'guest', hostName: '', hostUnit: '', purpose: '', vehiclePlate: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof PreRegisterInput, v: string) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await preRegisterVisitor(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? ''); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Pre-register visitor</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="flex flex-col gap-2.5">
          <div><label className="lbla">Visitor name</label><input value={f.visitorName} onChange={(e) => set('visitorName', e.target.value)} className="inpa" autoFocus placeholder="e.g. Ade Balogun" /></div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lbla">Type</label><select value={f.kind} onChange={(e) => set('kind', e.target.value)} className="inpa"><option value="guest">Guest</option><option value="contractor">Contractor</option><option value="delivery">Delivery</option><option value="ride_hail">Ride-hail</option></select></div>
            <div><label className="lbla">Vehicle plate</label><input value={f.vehiclePlate} onChange={(e) => set('vehiclePlate', e.target.value)} className="inpa" placeholder="optional" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lbla">Host</label><input value={f.hostName} onChange={(e) => set('hostName', e.target.value)} className="inpa" placeholder="Resident" /></div>
            <div><label className="lbla">Unit</label><input value={f.hostUnit} onChange={(e) => set('hostUnit', e.target.value)} className="inpa" placeholder="Block C · 12B" /></div>
          </div>
          <div><label className="lbla">Purpose</label><input value={f.purpose} onChange={(e) => set('purpose', e.target.value)} className="inpa" placeholder="Family visit" /></div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !f.visitorName.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Issuing…' : 'Issue gate pass'}</button></div>
        <style>{`.lbla{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpa{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpa:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
