'use client';

import { useMemo, useState } from 'react';
import { FlaskConical, RotateCcw, Zap, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { recoveryPlan, simulate, fmtM, type EVM, type Task } from '@/domain/construction';

export type SimProject = { id: string; name: string; code: string; plannedFinishISO: string; startISO: string; approvedBudget: { minor: number; currency: 'NGN' }; plannedPercent: number; percentComplete: number };

const naira = (m: number) => `₦${fmtM(m)}`;
const DEFAULTS = { productivityPct: 100, dieselShockPct: 0, extraRainDays: 0, crashDays: 0 };

export function SimulatorWorkspace({ project, evm, tasks, criticalIds, baselineFinishISO, baselineSlipDays, dieselExposureMinor }: {
  project: SimProject; evm: EVM; tasks: Task[]; criticalIds: string[];
  baselineFinishISO: string; baselineSlipDays: number; dieselExposureMinor: number;
}) {
  const [a, setA] = useState(DEFAULTS);
  const critical = useMemo(() => new Set(criticalIds), [criticalIds]);

  const plan = useMemo(() => recoveryPlan(tasks, critical, a.crashDays), [tasks, critical, a.crashDays]);
  const sim = useMemo(
    () => simulate({ ...project } as never, evm, plan, a, dieselExposureMinor),
    [project, evm, plan, a, dieselExposureMinor],
  );

  const maxCrash = tasks.filter((t) => critical.has(t.id) && t.crash && t.status !== 'done').reduce((n, t) => n + (t.crash?.crashableDays ?? 0), 0);
  const dirty = JSON.stringify(a) !== JSON.stringify(DEFAULTS);
  const dDays = sim.slipDays - baselineSlipDays;
  const dCost = sim.eac - evm.eac;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0d0716 0%,#1e0f33 55%,#301650 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><FlaskConical size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">WHAT-IF SIMULATOR · {project.code}</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{project.name}</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">Move the assumptions — the same CPM and earned-value engines recompute. Nothing is saved.</div>
          </div>
          {dirty && <button onClick={() => setA(DEFAULTS)} className="ml-auto text-[12px] px-3 h-9 rounded-xl font-medium bg-white/10 inline-flex items-center gap-1.5"><RotateCcw size={13} /> Reset</button>}
        </div>
      </div>

      {/* Baseline vs scenario */}
      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-2.5">
        <Panel title="Baseline" muted>
          <Row label="Forecast finish" value={baselineFinishISO} sub={baselineSlipDays > 0 ? `${baselineSlipDays}d late` : 'on plan'} />
          <Row label="Forecast out-turn (EAC)" value={naira(evm.eac)} sub={`CPI ${evm.cpi.toFixed(2)} · SPI ${evm.spi.toFixed(2)}`} />
          <Row label="Variance at completion" value={`${evm.vac < 0 ? '−' : '+'}${naira(Math.abs(evm.vac))}`} tone={evm.vac < 0 ? 'danger' : 'success'} />
        </Panel>
        <Panel title="Scenario" accent>
          <Row label="Forecast finish" value={sim.finishISO} sub={`${sim.slipDays > 0 ? `${sim.slipDays}d late` : 'on plan'}${dDays !== 0 ? ` · ${dDays < 0 ? '' : '+'}${dDays}d vs baseline` : ''}`} tone={dDays < 0 ? 'success' : dDays > 0 ? 'danger' : undefined} />
          <Row label="Forecast out-turn (EAC)" value={naira(sim.eac)} sub={`CPI ${sim.cpi.toFixed(2)} · SPI ${sim.spi.toFixed(2)}${dCost !== 0 ? ` · ${dCost > 0 ? '+' : '−'}${naira(Math.abs(dCost))}` : ''}`} tone={dCost > 0 ? 'danger' : dCost < 0 ? 'success' : undefined} />
          <Row label="Variance at completion" value={`${sim.vac < 0 ? '−' : '+'}${naira(Math.abs(sim.vac))}`} tone={sim.vac < 0 ? 'danger' : 'success'} />
        </Panel>
      </div>

      {/* Assumptions */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="text-[12.5px] font-semibold mb-3">Assumptions</div>
        <div className="flex flex-col gap-4">
          <Slider label="Crew productivity" hint="vs the planned rate — drives SPI, and therefore the finish date" min={60} max={130} step={5} value={a.productivityPct} suffix="%" onChange={(v) => setA((s) => ({ ...s, productivityPct: v }))} />
          <Slider label="Diesel price shock" hint={`applied to ₦${fmtM(dieselExposureMinor)} of fuel-exposed spend — the Nigerian cost risk`} min={0} max={60} step={5} value={a.dieselShockPct} suffix="%" onChange={(v) => setA((s) => ({ ...s, dieselShockPct: v }))} />
          <Slider label="Extra rain days" hint="lost days added straight onto the finish" min={0} max={30} step={1} value={a.extraRainDays} suffix="d" onChange={(v) => setA((s) => ({ ...s, extraRainDays: v }))} />
          <Slider label="Days to claw back" hint={`crash the cheapest critical tasks — up to ${maxCrash}d available`} min={0} max={Math.max(1, maxCrash)} step={1} value={a.crashDays} suffix="d" onChange={(v) => setA((s) => ({ ...s, crashDays: v }))} tone="success" />
        </div>
      </section>

      {/* Recovery plan */}
      {a.crashDays > 0 && (
        <section className="bg-surface border rounded-2xl shadow-card overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--tone-success) 35%, transparent)' }}>
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
            <Zap size={14} style={{ color: toneVar('success') }} />
            <span className="text-[12.5px] font-semibold">Cheapest recovery plan</span>
            <span className="ml-auto text-[11.5px]">
              <span className="font-semibold" style={{ color: toneVar('success') }}>{plan.daysRecovered}d</span>
              <span className="text-text-3"> for </span>
              <span className="font-semibold">{naira(plan.extraCostMinor)}</span>
              <span className="text-text-3"> · {naira(plan.costPerDayMinor)}/day</span>
            </span>
          </div>
          <div className="divide-y divide-border">
            {plan.crashes.map((c) => (
              <div key={c.taskId} className="px-4 py-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{c.name}</div><div className="text-[10.5px] text-text-3">{naira(c.costPerDayMinor)}/day · on the critical chain</div></div>
                <span className="text-[12px] font-semibold font-mono flex-none" style={{ color: toneVar('success') }}>−{c.days}d</span>
                <span className="text-[12px] font-mono text-text-3 flex-none w-20 text-right">{naira(c.totalMinor)}</span>
              </div>
            ))}
          </div>
          {plan.shortfallDays > 0 && (
            <div className="px-4 py-2.5 text-[11.5px]" style={{ background: 'color-mix(in srgb, var(--tone-warn) 7%, transparent)', color: toneVar('warn') }}>
              Only {plan.daysRecovered}d can be bought — {plan.shortfallDays}d short. Beyond this the sequence itself has to change (extra shift, re-sequence, or accept the date).
            </div>
          )}
          <div className="px-4 py-2.5 text-[10.5px] text-text-3 border-t border-border">Only zero-float tasks are crashed — shortening anything else spends money without moving the finish date.</div>
        </section>
      )}

      <div className="text-[11px] text-text-3 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-none" /> A scenario is a calculation, not a plan. Applying one to the baseline is a deliberate, logged re-plan — never automatic.</div>
    </div>
  );
}

function Panel({ title, children, muted, accent }: { title: string; children: React.ReactNode; muted?: boolean; accent?: boolean }) {
  return (
    <section className="bg-surface border rounded-2xl shadow-card p-4" style={{ borderColor: accent ? 'color-mix(in srgb, var(--tone-progress) 35%, transparent)' : 'var(--border)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: accent ? toneVar('progress') : 'var(--text-3)' }}>{title}{muted ? '' : ''}</div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}
function Row({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11.5px] text-text-3">{label}</span>
      <span className="text-right">
        <span className="text-[14px] font-bold tracking-[-0.02em] font-mono" style={tone ? { color: toneVar(tone) } : undefined}>{value}</span>
        {sub && <span className="block text-[10px] text-text-3">{sub}</span>}
      </span>
    </div>
  );
}
function Slider({ label, hint, min, max, step, value, suffix, onChange, tone }: { label: string; hint: string; min: number; max: number; step: number; value: number; suffix: string; onChange: (v: number) => void; tone?: Tone }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[12px] font-medium">{label}</span>
        <span className="text-[13px] font-bold font-mono" style={{ color: toneVar(tone ?? 'progress') }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" aria-label={label} />
      <div className="text-[10.5px] text-text-3 mt-0.5">{hint}</div>
    </div>
  );
}
