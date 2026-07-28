'use client';

import { useState } from 'react';
import { Building2, Plus, X, Wallet, Users, Wrench, Gauge, Power } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type TenantDetail = {
  id: string; label: string; plan: string; mrrMinor: number; sites: string[];
  units: number; users: number; activeUsers: number; suspendedUsers: number;
  workOrders: number; openWO: number; overdue: number;
  score: number; band: Tone; healthLabel: string;
};

function naira(minor: number): string {
  const n = minor / 100;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n)}`;
}

export function TenantsWorkspace({ tenants }: { tenants: TenantDetail[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [suspended, setSuspended] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const open = tenants.find((t) => t.id === openId) ?? null;
  const totalMrr = tenants.reduce((n, t) => n + t.mrrMinor, 0);
  const avgHealth = tenants.length ? Math.round(tenants.reduce((n, t) => n + t.score, 0) / tenants.length) : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Tenants" value={String(tenants.length)} tone="info" icon={<Building2 size={16} />} />
        <Kpi label="Platform MRR" value={naira(totalMrr)} tone="success" icon={<Wallet size={16} />} />
        <Kpi label="Total units" value={tenants.reduce((n, t) => n + t.units, 0).toLocaleString()} tone="progress" icon={<Building2 size={16} />} />
        <Kpi label="Avg health" value={String(avgHealth)} tone={avgHealth >= 80 ? 'success' : 'warn'} icon={<Gauge size={16} />} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Organisations</h2>
        <button onClick={() => setOnboarding(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105"><Plus size={16} /> Onboard tenant</button>
      </div>

      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3">
        {tenants.map((t) => {
          const isSusp = suspended.has(t.id);
          return (
            <button key={t.id} onClick={() => setOpenId(t.id)} className="text-left bg-surface border border-border rounded-2xl shadow-card p-4 hover:border-primary/40 hover:shadow-float transition-all">
              <div className="flex items-center gap-3">
                <HealthDial score={t.score} band={isSusp ? 'neutral' : t.band} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold truncate">{t.label}</div>
                  <div className="text-[11.5px] text-text-3">{t.plan} · {t.units} units · <span style={{ color: toneVar(isSusp ? 'neutral' : t.band) }}>{isSusp ? 'Suspended' : t.healthLabel}</span></div>
                </div>
                <div className="text-right flex-none"><div className="text-[14px] font-mono font-semibold">{naira(t.mrrMinor)}</div><div className="text-[10.5px] text-text-3">MRR</div></div>
              </div>
            </button>
          );
        })}
      </div>

      {open && <TenantDrawer t={open} suspended={suspended.has(open.id)} onClose={() => setOpenId(null)} onToggleSuspend={() => { setSuspended((s) => { const n = new Set(s); if (n.has(open.id)) n.delete(open.id); else n.add(open.id); return n; }); flash(suspended.has(open.id) ? `${open.label} reactivated` : `${open.label} suspended (demo)`); }} />}
      {onboarding && <OnboardDialog onClose={() => setOnboarding(false)} onDone={(name) => { setOnboarding(false); flash(`${name || 'Tenant'} onboarding started (demo)`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function TenantDrawer({ t, suspended, onClose, onToggleSuspend }: { t: TenantDetail; suspended: boolean; onClose: () => void; onToggleSuspend: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full bg-surface border-l border-border shadow-float overflow-y-auto animate-[tms-slidein_.22s_ease]">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-4 py-3 flex items-start justify-between">
          <div><h2 className="text-[16px] font-semibold">{t.label}</h2><p className="text-[12px] text-text-3 font-mono">{t.id} · {t.plan} plan</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface-2 p-3.5 flex items-center gap-3">
            <HealthDial score={t.score} band={suspended ? 'neutral' : t.band} big />
            <div><div className="text-[13px] font-semibold">Health · <span style={{ color: toneVar(suspended ? 'neutral' : t.band) }}>{suspended ? 'Suspended' : t.healthLabel}</span></div><div className="text-[11.5px] text-text-3">{naira(t.mrrMinor)} MRR · {t.sites.join(', ')}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Vital icon={<Building2 size={14} />} label="Units" value={t.units.toLocaleString()} />
            <Vital icon={<Users size={14} />} label="Users" value={`${t.activeUsers} active${t.suspendedUsers ? ` · ${t.suspendedUsers} susp.` : ''}`} />
            <Vital icon={<Wrench size={14} />} label="Work orders" value={`${t.openWO} open / ${t.workOrders}`} tone={t.openWO > t.workOrders / 2 ? 'warn' : 'success'} />
            <Vital icon={<Wallet size={14} />} label="Overdue invoices" value={String(t.overdue)} tone={t.overdue ? 'danger' : 'success'} />
          </div>
          <button onClick={onToggleSuspend} className={`h-10 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-1.5 ${suspended ? 'bg-primary text-white' : 'border border-[color:var(--tone-danger)]/40 text-negative'}`}><Power size={15} /> {suspended ? 'Reactivate tenant' : 'Suspend tenant'}</button>
          <p className="text-[10.5px] text-text-3">Suspension is a demo control. In production it disables tenant access and is an SC-10 audit event.</p>
        </div>
      </div>
    </div>
  );
}

function OnboardDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('Growth');
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Onboard tenant</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Organisation name" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-2.5" />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-3">{['Starter', 'Growth', 'Enterprise'].map((p) => <option key={p}>{p}</option>)}</select>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={() => onDone(name)} disabled={!name.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">Start onboarding</button></div>
      </div>
    </div>
  );
}

function HealthDial({ score, band, big = false }: { score: number; band: Tone; big?: boolean }) {
  const color = toneVar(band);
  const s = big ? 52 : 42;
  return (
    <div className="relative flex-none" style={{ width: s, height: s }}>
      <svg width={s} height={s} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * 94.2} 94.2`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold" style={{ color, fontSize: big ? 13 : 11 }}>{score}</span>
    </div>
  );
}
function Vital({ icon, label, value, tone = 'neutral' }: { icon: React.ReactNode; label: string; value: string; tone?: Tone }) {
  return <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-[10.5px] text-text-3 uppercase tracking-wide flex items-center gap-1">{icon}{label}</div><div className="text-[13px] font-semibold mt-0.5" style={{ color: tone === 'neutral' ? undefined : toneVar(tone) }}>{value}</div></div>;
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div>
      <div className="text-[18px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
    </div>
  );
}
