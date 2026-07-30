'use client';

import { useState } from 'react';
import { Building2, Layers, TriangleAlert, HelpCircle } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type TwinZone = {
  id: string; level: number; label: string; block: string;
  layers: { structure: number; blockwork: number; mep: number; finishes: number };
  progress: number; band: Tone; openIssues: number; openRfis: number;
  tasks: { name: string; percentComplete: number; status: string }[];
};

const LAYERS = [
  { key: 'structure', label: 'Structure', tone: 'info' as Tone },
  { key: 'blockwork', label: 'Blockwork', tone: 'progress' as Tone },
  { key: 'mep', label: 'MEP', tone: 'warn' as Tone },
  { key: 'finishes', label: 'Finishes', tone: 'success' as Tone },
] as const;

export function TwinWorkspace({ zones, projectName, kpis }: {
  zones: TwinZone[]; projectName: string;
  kpis: { levels: number; avgProgress: number; topped: number; activeLevel: number; openIssues: number };
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [layer, setLayer] = useState<'all' | typeof LAYERS[number]['key']>('all');
  const zone = zones.find((z) => z.id === sel) ?? null;
  const ordered = [...zones].sort((a, b) => b.level - a.level); // top floor first, like the real building

  const shown = (z: TwinZone) => layer === 'all' ? z.progress : z.layers[layer];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#071016 0%,#0f2430 55%,#173947 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Building2 size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">SITE TWIN · {projectName.toUpperCase()}</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">Level {kpis.activeLevel} is the working face</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{kpis.topped} of {kpis.levels} levels structurally complete · {kpis.avgProgress}% average across the building</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Levels" value={String(kpis.levels)} tone="info" icon={<Layers size={16} />} />
        <Kpi label="Structurally done" value={`${kpis.topped}/${kpis.levels}`} tone="progress" icon={<Building2 size={16} />} />
        <Kpi label="Average progress" value={`${kpis.avgProgress}%`} tone={kpis.avgProgress >= 60 ? 'success' : 'warn'} icon={<Layers size={16} />} />
        <Kpi label="Open issues" value={String(kpis.openIssues)} tone={kpis.openIssues ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
      </div>

      {/* Layer filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setLayer('all')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium border" style={layer === 'all' ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : { borderColor: 'var(--border-2)' }}>All trades</button>
        {LAYERS.map((l) => (
          <button key={l.key} onClick={() => setLayer(l.key)} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium border inline-flex items-center gap-1.5" style={layer === l.key ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar(l.tone)} 15%, transparent)`, color: toneVar(l.tone) } : { borderColor: 'var(--border-2)' }}>
            <span className="w-2 h-2 rounded-sm" style={{ background: toneVar(l.tone) }} /> {l.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* The building */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3">The building · click a level</div>
          <div className="flex flex-col gap-1.5">
            {ordered.map((z) => {
              const pct = shown(z);
              const active = z.id === sel;
              return (
                <button key={z.id} onClick={() => setSel(active ? null : z.id)} className="w-full text-left group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono text-text-3 w-6 flex-none">L{z.level}</span>
                    <div className="flex-1 h-8 rounded-lg bg-surface-2 overflow-hidden relative border transition-colors" style={{ borderColor: active ? toneVar('progress') : 'transparent' }}>
                      {layer === 'all' ? (
                        // Stacked slab: each trade shown in sequence across the floor plate.
                        <div className="absolute inset-0 flex">
                          {LAYERS.map((l) => (
                            <div key={l.key} className="h-full relative" style={{ width: '25%' }}>
                              <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${z.layers[l.key]}%`, background: `color-mix(in srgb, ${toneVar(l.tone)} 60%, transparent)` }} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, background: `color-mix(in srgb, ${toneVar(LAYERS.find((l) => l.key === layer)!.tone)} 60%, transparent)` }} />
                      )}
                      <div className="absolute inset-0 flex items-center px-2.5 gap-2">
                        <span className="text-[11.5px] font-medium">{z.label}</span>
                        {z.openIssues > 0 && <span className="text-[9.5px] px-1.5 h-4 inline-flex items-center rounded-full font-semibold" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 20%, transparent)`, color: toneVar('danger') }}>{z.openIssues}</span>}
                        {z.openRfis > 0 && <span className="text-[9.5px] px-1.5 h-4 inline-flex items-center rounded-full font-semibold gap-0.5" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 20%, transparent)`, color: toneVar('warn') }}><HelpCircle size={8} />{z.openRfis}</span>}
                        <span className="ml-auto text-[11px] font-mono font-semibold" style={{ color: toneVar(z.band) }}>{pct}%</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {/* Ground line */}
            <div className="flex items-center gap-2 mt-1"><span className="w-6 flex-none" /><div className="flex-1 h-px bg-border-2" /></div>
          </div>
          {layer === 'all' && <div className="flex gap-3 text-[10.5px] text-text-3 mt-3 flex-wrap">{LAYERS.map((l) => <span key={l.key} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: toneVar(l.tone) }} />{l.label}</span>)}<span className="text-text-3">· each quarter of the bar is one trade</span></div>}
        </section>

        {/* Level detail */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          {zone ? (
            <>
              <div className="text-[13px] font-semibold">{zone.label}</div>
              <div className="text-[11px] text-text-3 mb-3">{zone.block} · {zone.progress}% complete</div>
              <div className="flex flex-col gap-2.5">
                {LAYERS.map((l) => (
                  <div key={l.key}>
                    <div className="flex justify-between text-[11px] mb-0.5"><span className="text-text-2">{l.label}</span><span className="font-mono text-text-3">{zone.layers[l.key]}%</span></div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${zone.layers[l.key]}%`, background: toneVar(l.tone) }} /></div>
                  </div>
                ))}
              </div>
              {zone.tasks.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mt-4 mb-1.5">Work here</div>
                  <div className="flex flex-col gap-1.5">
                    {zone.tasks.map((t) => (
                      <div key={t.name} className="flex items-center gap-2 text-[11.5px]">
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <span className="font-mono text-text-3 flex-none">{t.percentComplete}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(zone.openIssues > 0 || zone.openRfis > 0) && (
                <div className="mt-3 pt-3 border-t border-border text-[11.5px]" style={{ color: toneVar('warn') }}>
                  {zone.openIssues > 0 && <div>{zone.openIssues} open issue{zone.openIssues === 1 ? '' : 's'} pinned here</div>}
                  {zone.openRfis > 0 && <div>{zone.openRfis} unanswered RFI{zone.openRfis === 1 ? '' : 's'} blocking work</div>}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Layers size={20} className="mx-auto mb-2 text-text-3" />
              <div className="text-[12.5px] font-medium">Pick a level</div>
              <div className="text-[11px] text-text-3 mt-1">See its trade breakdown, the tasks building it, and anything pinned there.</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
