'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, PackageCheck, PackagePlus, Clock, Boxes, Bell, X, Check, MapPin } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { isParcelOverdue, type ParcelStatus, type LockerSize } from '@/domain/estate';
import { logParcel, collectParcel, notifyResident, type LogParcelInput } from '@/server/actions/estate';

export type LockerCell = { id: string; bank: string; label: string; size: LockerSize; occupied: boolean };
export type ParcelRow = { id: string; code: string; residentName: string; unitLabel: string; courier: string; size: LockerSize; status: ParcelStatus; lockerLabel?: string; receivedISO: string };

const STATUS_TONE: Record<ParcelStatus, Tone> = { received: 'info', stored: 'progress', collected: 'muted', overdue: 'danger' };
function ago(iso: string, nowMs: number) { const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 86400000)); return s === 0 ? 'today' : `${s}d ago`; }

export function ParcelsWorkspace({ lockers, parcels, kpis, nowMs }: {
  lockers: LockerCell[]; parcels: ParcelRow[];
  kpis: { inLocker: number; awaiting: number; overdue: number; collectedToday: number; util: { used: number; total: number; pct: number } };
  nowMs: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showLog, setShowLog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  const banks = [...new Set(lockers.map((l) => l.bank))];
  const active = parcels.filter((p) => p.status !== 'collected').sort((a, b) => (isParcelOverdue(b, nowMs) ? 1 : 0) - (isParcelOverdue(a, nowMs) ? 1 : 0) || Date.parse(a.receivedISO) - Date.parse(b.receivedISO));
  const collected = parcels.filter((p) => p.status === 'collected');

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#241503 0%,#3d2708 55%,#5a3a12 100%)' }}>
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring pct={kpis.util.pct} />
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><Boxes size={12} /> PARCEL ROOM</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">{kpis.inLocker} in lockers · {kpis.awaiting} at the desk</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{kpis.util.used}/{kpis.util.total} lockers in use{kpis.overdue > 0 && <> · <span className="text-[#fca5a5] font-medium">{kpis.overdue} overdue for pickup</span></>}</div>
          </div>
          <button onClick={() => setShowLog(true)} className="ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl font-semibold text-[13px] bg-white text-[#5a3a12]"><PackagePlus size={15} /> Log parcel</button>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="In lockers" value={String(kpis.inLocker)} tone="progress" icon={<Package size={16} />} />
        <Kpi label="Awaiting desk" value={String(kpis.awaiting)} tone="info" icon={<Boxes size={16} />} />
        <Kpi label="Overdue" value={String(kpis.overdue)} tone={kpis.overdue ? 'danger' : 'success'} icon={<Clock size={16} />} />
        <Kpi label="Collected today" value={String(kpis.collectedToday)} tone="success" icon={<PackageCheck size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[300px_1fr] gap-3.5 items-start">
        {/* Locker grid */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3">Locker banks</div>
          <div className="flex flex-col gap-3">
            {banks.map((bank) => (
              <div key={bank}>
                <div className="text-[10.5px] text-text-3 mb-1.5">{bank}</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {lockers.filter((l) => l.bank === bank).map((l) => (
                    <div key={l.id} className="aspect-square rounded-lg grid place-items-center text-[10px] font-semibold" title={`${l.label} · ${l.size} · ${l.occupied ? 'occupied' : 'free'}`} style={{ background: l.occupied ? `color-mix(in srgb, ${toneVar('progress')} 18%, transparent)` : 'var(--surface-2)', color: l.occupied ? toneVar('progress') : 'var(--text-3)', border: `1px solid ${l.occupied ? 'transparent' : 'var(--border)'}` }}>
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Parcels */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Package size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Parcels</span><span className="ml-auto text-[11px] text-text-3">{active.length} active</span></div>
          <div className="divide-y divide-border">
            {active.map((p) => {
              const overdue = isParcelOverdue(p, nowMs);
              return (
                <div key={p.id} className="px-4 py-2.5 flex items-center gap-2.5" style={overdue ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
                  <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[overdue ? 'overdue' : p.status])} 13%, transparent)`, color: toneVar(STATUS_TONE[overdue ? 'overdue' : p.status]) }}><Package size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium flex items-center gap-1.5 truncate">{p.residentName} <span className="font-mono text-[10px] text-text-3">{p.code}</span>{overdue && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 14%, transparent)`, color: toneVar('danger') }}>overdue</span>}</div>
                    <div className="text-[10.5px] text-text-3 truncate">{p.unitLabel} · {p.courier} · {p.size}{p.lockerLabel ? <> · <MapPin size={9} className="inline" /> {p.lockerLabel}</> : ' · at desk'} · {ago(p.receivedISO, nowMs)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-none">
                    <button disabled={pending} onClick={() => act(() => notifyResident(p.id), 'Resident notified')} className="w-7 h-7 rounded-lg grid place-items-center border border-border-2 disabled:opacity-50" title="Notify resident"><Bell size={12} /></button>
                    <button disabled={pending} onClick={() => act(() => collectParcel(p.id), 'Marked collected')} className="text-[11px] px-2.5 h-7 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Collect</button>
                  </div>
                </div>
              );
            })}
            {active.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-text-3">No parcels waiting.</div>}
            {collected.length > 0 && <div className="px-4 py-2 text-[10.5px] text-text-3 bg-surface-2">Collected today: {collected.map((p) => p.code).join(', ')}</div>}
          </div>
        </section>
      </div>

      {showLog && <LogDialog onClose={() => setShowLog(false)} onDone={(code) => { setShowLog(false); flash(`Logged · ${code}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function LogDialog({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<LogParcelInput>({ residentName: '', unitLabel: '', courier: '', size: 'M' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof LogParcelInput, v: string) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await logParcel(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? ''); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Log a parcel</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="flex flex-col gap-2.5">
          <div><label className="lblp">Resident</label><input value={f.residentName} onChange={(e) => set('residentName', e.target.value)} className="inpp" autoFocus placeholder="e.g. Folake Bello" /></div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lblp">Unit</label><input value={f.unitLabel} onChange={(e) => set('unitLabel', e.target.value)} className="inpp" placeholder="Block C · 12B" /></div>
            <div><label className="lblp">Courier</label><input value={f.courier} onChange={(e) => set('courier', e.target.value)} className="inpp" placeholder="Jumia" /></div>
          </div>
          <div><label className="lblp">Size</label><select value={f.size} onChange={(e) => set('size', e.target.value)} className="inpp"><option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option></select></div>
        </div>
        <p className="text-[10.5px] text-text-3 mt-2">A free locker is auto-assigned; a pickup code is generated for the resident.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !f.residentName.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Logging…' : 'Log & assign'}</button></div>
        <style>{`.lblp{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpp{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpp:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Ring({ pct }: { pct: number }) {
  const band: Tone = pct >= 80 ? 'danger' : pct >= 50 ? 'warn' : 'success';
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[20px] font-bold leading-none" style={{ color }}>{pct}%</span><span className="text-[8px] text-white/60 uppercase tracking-wide">lockers</span></div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
