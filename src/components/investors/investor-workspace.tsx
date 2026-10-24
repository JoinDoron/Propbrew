'use client';

import { PageTabs } from '@/components/ui/page-tabs';
import { useState } from 'react';
import { Building2, TrendingUp, Users, X, Sparkles, CalendarClock, Wallet } from 'lucide-react';
import type { InvestorProject } from '@/domain/entities';
import { forecastProject, pipelineFunnel, unitsGrid, scoreLeads, portfolioSummary } from '@/domain/investors';
import { toneVar, type Tone } from '@/lib/status-tones';

const STATUS_TONE: Record<InvestorProject['status'], Tone> = { planning: 'neutral', selling: 'info', construction: 'warn', completed: 'success' };
const STAGES: InvestorProject['status'][] = ['planning', 'selling', 'construction', 'completed'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortN(minor: number): string {
  const n = minor / 100;
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(0)}k`;
  return `₦${n}`;
}
function monthLabel(iso: string | null): string {
  if (!iso) return '—';
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function InvestorWorkspace({ projects }: { projects: readonly InvestorProject[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const pf = portfolioSummary(projects);
  const open = projects.find((p) => p.id === openId) ?? null;

  return (
    <div className="pb-section">

<PageTabs label="Investor portfolio sections" items={[
{ id: 'projects', label: 'Project portfolio', content: <div className="pb-section">

<div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3.5">
        {projects.map((p) => {
          const f = forecastProject(p);
          const fn = pipelineFunnel(p);
          return (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left bg-surface border border-border rounded-2xl shadow-card p-4 hover:border-primary/40 hover:shadow-float transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="pb-panel-title text-[15px] font-semibold tracking-[-0.01em]">{p.name}</h3>
                  <p className="text-[12px] text-text-3 mt-0.5">{p.location}</p>
                </div>
                <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[p.status])} 14%, transparent)`, color: toneVar(STATUS_TONE[p.status]) }}>{p.status}</span>
              </div>

              <div className="mt-3.5">
                <div className="flex items-center justify-between text-[12px] mb-1.5"><span className="text-text-2">{p.unitsSold}/{p.unitsTotal} units</span><span className="font-mono text-text-3">{f.pctSold}%</span></div>
                <UnitBar grid={unitsGrid(p)} />
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-border">
                <Mini label="Pace" value={`${f.monthlyPace}/mo`} />
                <Mini label={f.selloutISO ? 'Sell-out' : 'Status'} value={f.selloutISO ? monthLabel(f.selloutISO) : 'Sold out'} />
                <Mini label="ROI est." value={`${f.roiPct}%`} />
              </div>
              <div className="text-[12px] text-text-3 mt-2 flex items-center gap-1"><Users size={11} /> {fn.leads} leads in pipeline · tap for detail</div>
            </button>
          );
        })}
      </div>
</div> },
{ id: 'overview', label: 'Investment overview', content: <div className="pb-section">

<div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Projects" value={String(pf.projects)} note={`${pf.unitsTotal} units`} tone="info" icon={<Building2 size={18} />} />
        <Kpi label="Units sold" value={`${pf.unitsSold}/${pf.unitsTotal}`} note={`${Math.round((pf.unitsSold / pf.unitsTotal) * 100)}% absorbed`} tone="success" icon={<TrendingUp size={18} />} />
        <Kpi label="Sales to date" value={shortN(pf.salesToDateMinor)} note={`of ${shortN(pf.targetMinor)} target`} tone="info" icon={<Wallet size={18} />} />
        <Kpi label="Blended ROI" value={`${pf.weightedRoiPct}%`} note="estimate · unit-weighted" tone="progress" icon={<Sparkles size={18} />} />
      </div>
</div> }
]} />
{open && <ProjectDrawer project={open} onClose={() => setOpenId(null)} />}
</div>
  );
}

function ProjectDrawer({ project: p, onClose }: { project: InvestorProject; onClose: () => void }) {
  const f = forecastProject(p);
  const fn = pipelineFunnel(p);
  const grid = unitsGrid(p);
  const leads = scoreLeads(p);
  const stageIdx = STAGES.indexOf(p.status);
  const funnelMax = Math.max(fn.leads, 1);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[520px] h-full bg-surface border-l border-border shadow-float overflow-y-auto animate-[tms-slidein_.22s_ease]">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-4 py-3 flex items-start justify-between">
          <div>
            <h2 className="pb-dialog-title text-[16px] font-semibold">{p.name}</h2>
            <p className="text-[12px] text-text-3">{p.location}</p>
          </div>
          <button onClick={onClose} className="pb-icon-action w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Forecast band */}
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-primary mb-2"><Sparkles size={13} /> Forecast · estimate, assumptions shown</div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Sales pace" value={`${f.monthlyPace}`} unit="units/mo" />
              <Stat label="Projected sell-out" value={f.selloutISO ? monthLabel(f.selloutISO) : 'Sold out'} unit={f.monthsToSellout ? `~${f.monthsToSellout} mo` : 'complete'} />
              <Stat label="Proj. revenue" value={shortN(f.projectedRevenueMinor)} unit={`${f.revenuePct}% booked`} />
            </div>
            <p className="text-[12px] text-text-3 mt-2.5 leading-relaxed">Pace assumes ~{f.monthsOnMarket} months absorbing sales at the current stage; sell-out extrapolates remaining {f.remaining} units at that pace from the demo date. Revenue = avg. achieved unit price × total inventory. Not financial advice.</p>
          </div>

          {/* Sales funnel */}
          <Section title="Sales pipeline" hint={`${fn.leadToSold}% lead→sold`}>
            <div className="flex flex-col gap-1.5">
              {([['Leads', fn.leads, 'info'], ['Reserved', fn.reserved, 'warn'], ['Sold', fn.sold, 'success']] as const).map(([label, val, tone]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-16 text-[12px] text-text-2">{label}</span>
                  <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden"><div className="h-full rounded-md flex items-center justify-end pr-2 text-[12px] font-semibold text-white" style={{ width: `${Math.max(12, (val / funnelMax) * 100)}%`, background: toneVar(tone) }}>{val}</div></div>
                </div>
              ))}
            </div>
          </Section>

          {/* Units grid heatmap */}
          <Section title="Inventory" hint={`${p.unitsSold} sold · ${fn.reserved} reserved · ${f.remaining - fn.reserved} available`}>
            <div className="flex flex-wrap gap-[3px]">
              {grid.map((c, i) => (
                <span key={i} className="w-[13px] h-[13px] rounded-[3px]" title={c} style={{ background: c === 'sold' ? toneVar('success') : c === 'reserved' ? toneVar('warn') : 'var(--surface-3)' }} />
              ))}
            </div>
            <div className="flex gap-3 mt-2 text-[12px] text-text-3">
              <Legend tone="success" label="Sold" /><Legend tone="warn" label="Reserved" /><Legend tone="neutral" label="Available" />
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Milestones">
            <div className="flex items-center">
              {STAGES.map((s, i) => (
                <div key={s} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="w-5 h-5 rounded-full grid place-items-center text-[12px] font-bold" style={{ background: i <= stageIdx ? toneVar('success') : 'var(--surface-3)', color: i <= stageIdx ? '#fff' : 'var(--text-3)' }}>{i < stageIdx ? '✓' : i + 1}</span>
                    <span className="text-[9.5px] capitalize text-text-3">{s}</span>
                  </div>
                  {i < STAGES.length - 1 && <div className="flex-1 h-0.5 mx-1" style={{ background: i < stageIdx ? toneVar('success') : 'var(--surface-3)' }} />}
                </div>
              ))}
            </div>
            <div className="text-[12px] text-text-3 mt-2 flex items-center gap-1"><CalendarClock size={12} /> Handover target {monthLabel(p.handoverDate.slice(0, 7) + '-01')} · occupancy {p.occupancyPct}%</div>
          </Section>

          {/* Leads */}
          <Section title="Top leads" hint="AI-S-04 scoring">
            <div className="flex flex-col divide-y divide-border">
              {leads.map((l) => (
                <div key={l.name} className="flex items-center gap-3 py-2">
                  <div className="w-9 text-right"><span className="font-mono text-[13px] font-bold" style={{ color: toneVar(l.hot ? 'danger' : l.score >= 55 ? 'warn' : 'neutral') }}>{l.score}</span></div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium">{l.name}{l.hot && <span className="ml-1.5 text-[9.5px] font-semibold text-negative">HOT</span>}</div><div className="text-[12px] text-text-3">{l.source} · {l.band}</div></div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2"><h3 className="pb-panel-title text-sm font-medium">{title}</h3>{hint && <span className="text-[12px] text-text-3">{hint}</span>}</div>
      {children}
    </div>
  );
}
function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div><div className="text-[12px] text-text-3">{label}</div><div className="text-[15px] font-bold tracking-[-0.01em] leading-tight mt-0.5">{value}</div><div className="text-[12px] text-text-3">{unit}</div></div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[12px] text-text-3 uppercase tracking-[0.04em]">{label}</div><div className="text-sm font-medium mt-0.5">{value}</div></div>;
}
function Legend({ tone, label }: { tone: Tone; label: string }) {
  return <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: tone === 'neutral' ? 'var(--surface-3)' : toneVar(tone) }} />{label}</span>;
}
function UnitBar({ grid }: { grid: ReturnType<typeof unitsGrid> }) {
  const sold = grid.filter((c) => c === 'sold').length;
  const reserved = grid.filter((c) => c === 'reserved').length;
  const total = grid.length || 1;
  return (
    <div className="h-2 rounded-full bg-surface-3 overflow-hidden flex">
      <div className="h-full" style={{ width: `${(sold / total) * 100}%`, background: toneVar('success') }} />
      <div className="h-full" style={{ width: `${(reserved / total) * 100}%`, background: toneVar('warn') }} />
    </div>
  );
}
function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-sm text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[23px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[12px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
