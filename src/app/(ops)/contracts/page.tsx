import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { contractStatus, coverageGap, CATEGORY_LABEL } from '@/domain/facility';
import { toneVar } from '@/lib/status-tones';
import { FileText, CalendarClock, Wallet, Gauge, ShieldAlert, Building2 } from 'lucide-react';

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

/** Contracts & SLAs — service/AMC contracts with a renewal runway, SLA
 *  target-vs-actual, total commitment, and a coverage-gap radar (which system
 *  categories have no active contract). */
export default async function ContractsPage() {
  const { actor } = await requireCapability('assets_ppm');
  const contracts = repos.facilityContracts.list(actor).items;
  const sites = new Map<string, string>(repos.sites.all(actor).map((s) => [s.id, s.name]));

  const active = contracts.filter((c) => contractStatus(c, NOW_MS).daysLeft >= 0);
  const expiring = contracts.filter((c) => { const d = contractStatus(c, NOW_MS).daysLeft; return d >= 0 && d <= 45; });
  const annualValue = contracts.reduce((n, c) => n + c.value.minor, 0);
  const avgSla = contracts.length ? Math.round(contracts.reduce((n, c) => n + c.slaActualPct, 0) / contracts.length) : 0;
  const gaps = coverageGap(contracts, NOW_MS);
  const sorted = [...contracts].sort((a, b) => contractStatus(a, NOW_MS).daysLeft - contractStatus(b, NOW_MS).daysLeft);

  return (
    <div className="max-w-[980px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Active contracts" value={`${active.length}/${contracts.length}`} tone="success" icon={<FileText size={16} />} />
        <Kpi label="Expiring ≤45d" value={String(expiring.length)} tone={expiring.length ? 'warn' : 'success'} icon={<CalendarClock size={16} />} />
        <Kpi label="Annual value" value={money(annualValue)} tone="progress" icon={<Wallet size={16} />} />
        <Kpi label="Avg SLA" value={`${avgSla}%`} tone={avgSla >= 95 ? 'success' : 'warn'} icon={<Gauge size={16} />} />
      </div>

      {/* Coverage gap radar */}
      <div className="rounded-xl border px-4 py-3" style={{ borderColor: gaps.length ? 'color-mix(in srgb, var(--tone-warn) 35%, transparent)' : 'var(--border)', background: gaps.length ? 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' : 'var(--surface)' }}>
        <div className="flex items-center gap-2 text-[12.5px] font-semibold mb-1.5"><ShieldAlert size={14} style={{ color: toneVar(gaps.length ? 'warn' : 'success') }} /> Coverage gaps</div>
        {gaps.length === 0 ? <p className="text-[12px] text-text-3">Every system category is under an active contract.</p> : (
          <div className="flex flex-wrap gap-2">
            {gaps.map((g) => <span key={g} className="text-[11.5px] px-2.5 h-7 inline-flex items-center rounded-full font-medium" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 12%, transparent)`, color: toneVar('warn') }}>{CATEGORY_LABEL[g]} — no cover</span>)}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.map((c) => {
          const st = contractStatus(c, NOW_MS);
          const slaOk = c.slaActualPct >= c.slaTargetPct;
          return (
            <div key={c.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{c.service}</div>
                  <div className="text-[11.5px] text-text-3 flex items-center gap-1"><Building2 size={11} /> {c.vendorName} · {sites.get(c.siteId) ?? ''} · {money(c.value.minor)}/yr</div>
                </div>
                <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(st.band)} 14%, transparent)`, color: toneVar(st.band) }}>{st.label}</span>
              </div>
              <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-3">Renewal runway</span><span className="font-mono" style={{ color: toneVar(st.band) }}>{st.daysLeft < 0 ? `${-st.daysLeft}d overdue` : `${st.daysLeft}d left`}</span></div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, ((st.daysLeft) / 365) * 100))}%`, background: toneVar(st.band) }} /></div>
                  <div className="text-[10px] text-text-3 mt-1">{c.startISO} → {c.endISO}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-3">SLA · target {c.slaTargetPct}%</span><span className="font-mono font-semibold" style={{ color: toneVar(slaOk ? 'success' : 'danger') }}>{c.slaActualPct}%</span></div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden relative"><div className="h-full rounded-full" style={{ width: `${c.slaActualPct}%`, background: toneVar(slaOk ? 'success' : 'danger') }} /><span className="absolute top-[-2px] bottom-[-2px] w-px bg-text-3" style={{ left: `${c.slaTargetPct}%` }} /></div>
                  <div className="text-[10px] text-text-3 mt-1">{slaOk ? 'Meeting SLA' : `${c.slaTargetPct - c.slaActualPct}pt below target`}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: 'success' | 'warn' | 'progress' | 'info'; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[16px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
