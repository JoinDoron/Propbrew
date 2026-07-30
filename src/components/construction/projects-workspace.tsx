'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Plus, X, Check, TrendingUp, Flag, ExternalLink } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';
import { createProject, type ProjectInput } from '@/server/actions/construction';

export type ProjectCard = {
  id: string; name: string; code: string; location: string; clientName: string; pmName: string; status: string;
  contractMinor: number; budgetMinor: number; committedMinor: number; actualMinor: number;
  percentComplete: number; plannedPercent: number; cpi: number; spi: number; healthScore: number; healthBand: Tone; healthLabel: string;
  startISO: string; plannedFinishISO: string; forecastFinishISO: string; slipDays: number;
  milestones: { name: string; dueISO: string; band: Tone; status: string }[];
  investorProjectId?: string;
};

const naira = (m: number) => `₦${fmtM(m)}`;
const STATUS_TONE: Record<string, Tone> = { planning: 'info', active: 'progress', on_hold: 'warn', closing: 'success', completed: 'muted' };

export function ProjectsWorkspace({ projects, kpis, canMutate }: {
  projects: ProjectCard[];
  kpis: { total: number; contractMinor: number; budgetMinor: number; committedMinor: number };
  canMutate: boolean;
}) {
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Projects" value={String(kpis.total)} tone="info" icon={<Building2 size={16} />} />
        <Kpi label="Contract value" value={naira(kpis.contractMinor)} tone="progress" icon={<TrendingUp size={16} />} />
        <Kpi label="Approved budget" value={naira(kpis.budgetMinor)} tone="info" icon={<Flag size={16} />} />
        <Kpi label="Committed" value={naira(kpis.committedMinor)} tone={kpis.committedMinor > kpis.budgetMinor ? 'danger' : 'success'} icon={<Check size={16} />} />
      </div>

      {canMutate && (
        <div className="flex justify-end">
          <button onClick={() => setShowNew(true)} className="text-[12px] px-3.5 h-9 rounded-xl bg-primary text-white font-medium inline-flex items-center gap-1.5"><Plus size={14} /> New project</button>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {projects.map((p) => (
          <section key={p.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold flex items-center gap-1.5 flex-wrap">
                  {p.name}
                  <span className="text-[10.5px] text-text-3 font-mono font-normal">{p.code}</span>
                  <span className="text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[p.status] ?? 'muted')} 14%, transparent)`, color: toneVar(STATUS_TONE[p.status] ?? 'muted') }}>{p.status.replace('_', ' ')}</span>
                </div>
                <div className="text-[11.5px] text-text-3 mt-0.5">{p.location} · {p.clientName} · PM {p.pmName}</div>
                {p.investorProjectId && <Link href="/investors" className="text-[10.5px] text-primary inline-flex items-center gap-1 mt-1"><ExternalLink size={10} /> Linked to the off-plan sales portfolio</Link>}
              </div>
              <HealthRing score={p.healthScore} band={p.healthBand} label={p.healthLabel} />
            </div>

            {/* Progress */}
            <div className="mt-3">
              <div className="flex justify-between text-[11px] mb-1"><span className="text-text-3">Physical progress</span><span className="font-mono">{p.percentComplete}% <span className="text-text-3">/ {p.plannedPercent}% planned</span></span></div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative">
                <div className="h-full rounded-full" style={{ width: `${p.percentComplete}%`, background: toneVar(p.percentComplete >= p.plannedPercent ? 'success' : 'warn') }} />
                <span className="absolute top-[-2px] bottom-[-2px] w-px bg-text" style={{ left: `${p.plannedPercent}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-3 mt-3">
              <Mini label="Contract" value={naira(p.contractMinor)} />
              <Mini label="Budget" value={naira(p.budgetMinor)} />
              <Mini label="Committed" value={naira(p.committedMinor)} tone={p.committedMinor > p.budgetMinor ? 'danger' : undefined} />
              <Mini label="Actual" value={naira(p.actualMinor)} />
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap text-[11px]">
              <span className="text-text-3">Finish</span>
              <span className="font-mono">{p.plannedFinishISO}</span>
              {p.slipDays > 0 && <span className="font-semibold" style={{ color: toneVar('danger') }}>→ {p.forecastFinishISO} (+{p.slipDays}d)</span>}
              <span className="ml-auto flex items-center gap-1.5">
                <Chip label={`CPI ${p.cpi.toFixed(2)}`} tone={p.cpi >= 1 ? 'success' : p.cpi >= 0.9 ? 'warn' : 'danger'} />
                <Chip label={`SPI ${p.spi.toFixed(2)}`} tone={p.spi >= 1 ? 'success' : p.spi >= 0.9 ? 'warn' : 'danger'} />
              </span>
            </div>

            {p.milestones.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                {p.milestones.map((m) => (
                  <span key={m.name} className="text-[10.5px] px-2 h-6 inline-flex items-center gap-1 rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(m.band)} 12%, transparent)`, color: toneVar(m.band) }}><Flag size={9} /> {m.name} · {m.dueISO}</span>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} onDone={(n) => { setShowNew(false); flash(`Project created · ${n}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function NewProjectDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<ProjectInput>({ name: '', location: '', clientName: '', contractNaira: 0, budgetNaira: 0, plannedFinishISO: '2028-06-30' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ProjectInput, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await createProject(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? f.name); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">New project</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="flex flex-col gap-2.5">
          <div><label className="lblp">Name</label><input value={f.name} onChange={(e) => set('name', e.target.value)} className="inpp" autoFocus placeholder="e.g. Harbour Point Phase 1" /></div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lblp">Location</label><input value={f.location} onChange={(e) => set('location', e.target.value)} className="inpp" placeholder="Lekki, Lagos" /></div>
            <div><label className="lblp">Client</label><input value={f.clientName} onChange={(e) => set('clientName', e.target.value)} className="inpp" placeholder="7 Fifteen Capital" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lblp">Contract (₦)</label><input value={f.contractNaira || ''} onChange={(e) => set('contractNaira', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} inputMode="numeric" className="inpp" /></div>
            <div><label className="lblp">Budget (₦)</label><input value={f.budgetNaira || ''} onChange={(e) => set('budgetNaira', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} inputMode="numeric" className="inpp" /></div>
          </div>
          <div><label className="lblp">Planned finish</label><input type="date" value={f.plannedFinishISO} onChange={(e) => set('plannedFinishISO', e.target.value)} className="inpp" /></div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !f.name.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Creating…' : 'Create'}</button></div>
        <style>{`.lblp{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpp{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpp:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function HealthRing({ score, band, label }: { score: number; band: Tone; label: string }) {
  const color = toneVar(band);
  return (
    <div className="flex items-center gap-2 flex-none">
      <div className="relative" style={{ width: 54, height: 54 }}>
        <svg width={54} height={54} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-[13px] font-bold" style={{ color }}>{score}</span></div>
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return <div><div className="text-[10px] text-text-3 uppercase tracking-wide">{label}</div><div className="text-[13px] font-semibold font-mono mt-0.5" style={tone ? { color: toneVar(tone) } : undefined}>{value}</div></div>;
}
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full font-mono" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{label}</span>;
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[16px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
