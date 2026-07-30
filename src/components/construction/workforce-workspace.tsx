'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Users, MapPin, ShieldAlert, Banknote, Check, X, HardHat } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';
import { clockWorker } from '@/server/actions/construction';

export type WorkerRow = {
  id: string; name: string; trade: string; kind: string; crew?: string; company?: string;
  dayRateMinor: number; certName?: string; certExpiryISO?: string; certDays: number | null; certBand: Tone;
  status: 'present' | 'absent' | 'pending'; method?: string; withinGeofence?: boolean; clockIn?: string;
};

const naira = (m: number) => `₦${fmtM(m)}`;
const KIND_TONE: Record<string, Tone> = { employee: 'success', subcontractor: 'info', temp: 'muted' };

export function WorkforceWorkspace({ workers, byTrade, kpis, projectName, projectId, canMutate }: {
  workers: WorkerRow[]; byTrade: { trade: string; present: number; total: number }[];
  kpis: { present: number; planned: number; shortfall: number; dayCostMinor: number; certAlerts: number };
  projectName: string; projectId: string; canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const toggle = (w: WorkerRow) => start(async () => { const r = await clockWorker(w.id, projectId, w.status !== 'present'); if (r.ok) { router.refresh(); flash(w.status === 'present' ? `${w.name} marked absent` : `${w.name} clocked in`); } else flash(r.error); });

  const maxTrade = Math.max(1, ...byTrade.map((t) => t.total));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#131007 0%,#2a2110 55%,#3f321a 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><HardHat size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">WORKFORCE · {projectName.toUpperCase()} · TODAY</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{kpis.present} of {kpis.planned} on site</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">
              {kpis.shortfall > 0 ? <span style={{ color: toneVar('warn') }}>{kpis.shortfall} short of the planned crew</span> : 'Full crew present'} · {naira(kpis.dayCostMinor)} labour today
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="On site" value={`${kpis.present}/${kpis.planned}`} tone={kpis.shortfall ? 'warn' : 'success'} icon={<Users size={16} />} />
        <Kpi label="Shortfall" value={String(kpis.shortfall)} tone={kpis.shortfall ? 'danger' : 'success'} icon={<MapPin size={16} />} />
        <Kpi label="Labour cost today" value={naira(kpis.dayCostMinor)} tone="progress" icon={<Banknote size={16} />} />
        <Kpi label="Certificate alerts" value={String(kpis.certAlerts)} tone={kpis.certAlerts ? 'danger' : 'success'} icon={<ShieldAlert size={16} />} />
      </div>

      {/* Trade mix */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="text-[12.5px] font-semibold mb-3">Trade mix · present vs allocated</div>
        <div className="flex flex-col gap-2.5">
          {byTrade.map((t) => (
            <div key={t.trade}>
              <div className="flex justify-between text-[11px] mb-0.5"><span className="text-text-2">{t.trade}</span><span className="font-mono text-text-3">{t.present}/{t.total}</span></div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative">
                <div className="h-full rounded-full opacity-30" style={{ width: `${(t.total / maxTrade) * 100}%`, background: toneVar('info') }} />
                <div className="h-full rounded-full absolute top-0 left-0" style={{ width: `${(t.present / maxTrade) * 100}%`, background: toneVar(t.present >= t.total ? 'success' : 'warn') }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Certificates */}
      {workers.some((w) => w.certDays !== null && w.certDays <= 30) && (
        <section className="rounded-2xl border p-4" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' }}>
          <div className="text-[12.5px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: toneVar('warn') }}><ShieldAlert size={14} /> Certificates expiring</div>
          <div className="flex flex-col gap-1.5">
            {workers.filter((w) => w.certDays !== null && w.certDays <= 30).map((w) => (
              <div key={w.id} className="text-[12px] flex items-center gap-2">
                <span className="font-medium">{w.name}</span>
                <span className="text-text-3">· {w.certName}</span>
                <span className="ml-auto font-semibold" style={{ color: toneVar(w.certBand) }}>{(w.certDays ?? 0) < 0 ? `expired ${-(w.certDays ?? 0)}d ago` : `${w.certDays}d left`}</span>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-text-3 mt-2">Certified work is blocked once a ticket lapses — renew before it stops the pour.</p>
        </section>
      )}

      {/* Roster */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Attendance · today</div>
        <div className="divide-y divide-border">
          {workers.map((w) => (
            <div key={w.id} className="px-4 py-2.5 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full grid place-items-center flex-none text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${toneVar(w.status === 'present' ? 'success' : 'muted')} 16%, transparent)`, color: toneVar(w.status === 'present' ? 'success' : 'muted') }}>{w.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium truncate flex items-center gap-1.5">{w.name} <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(KIND_TONE[w.kind] ?? 'muted')} 14%, transparent)`, color: toneVar(KIND_TONE[w.kind] ?? 'muted') }}>{w.kind}</span></div>
                <div className="text-[10.5px] text-text-3 truncate">{w.trade}{w.crew ? ` · crew ${w.crew}` : ''}{w.company ? ` · ${w.company}` : ''} · {naira(w.dayRateMinor)}/day</div>
              </div>
              <div className="flex items-center gap-2 flex-none">
                {w.status === 'present' && w.clockIn && <span className="text-[10.5px] text-text-3 font-mono">{w.clockIn}</span>}
                {w.status === 'present' && w.withinGeofence && <span className="text-[9.5px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full gap-1" style={{ background: `color-mix(in srgb, ${toneVar('success')} 14%, transparent)`, color: toneVar('success') }}><MapPin size={9} /> {w.method}</span>}
                <span className="text-[10px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(w.status === 'present' ? 'success' : w.status === 'absent' ? 'danger' : 'muted')} 14%, transparent)`, color: toneVar(w.status === 'present' ? 'success' : w.status === 'absent' ? 'danger' : 'muted') }}>{w.status}</span>
                {canMutate && <button disabled={pending} onClick={() => toggle(w)} className="w-7 h-7 rounded-lg grid place-items-center border border-border-2 disabled:opacity-50" title={w.status === 'present' ? 'Mark absent' : 'Clock in'}>{w.status === 'present' ? <X size={13} /> : <Check size={13} />}</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
