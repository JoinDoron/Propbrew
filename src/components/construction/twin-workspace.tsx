'use client';

import { ConstructionSummary, ConstructionPanel, ConstructionKpi as Kpi, ConstructionFrame, ConstructionEmpty } from './construction-ui';
import { Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './construction-delivery-polish.module.css';

import { useState } from 'react';
import { Building2, Layers, TriangleAlert } from 'lucide-react';
import { humanizeStatus, toneVar, type Tone } from '@/lib/status-tones';
import { PageTabs } from '@/components/ui/page-tabs';

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
    <ConstructionFrame>
      <ConstructionSummary>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="construction-summary-icon" ><Building2 size={22} /></span>
          <div className="min-w-0">
            <div className="text-[14px] text-text-3">SITE TWIN · {projectName.toUpperCase()}</div>
            <h2 className="text-[20px] font-medium tracking-[-0.02em] leading-tight mt-0.5">{zones.length ? `Level ${kpis.activeLevel} is the working face` : 'No building levels recorded'}</h2>
            <div className="text-[14px] text-text-3 mt-0.5">{kpis.topped} of {kpis.levels} levels structurally complete · {kpis.avgProgress}% average across the building</div>
          </div>
        </div>
      </ConstructionSummary>

      <PageTabs label="Construction digital twin sections" items={[
        {
          id: 'building', label: 'Building twin', content: <div className={styles.stack}>
            <div className={styles.filters} role="group" aria-label="Building trade layer">
              <Button type="button" variant={layer === 'all' ? 'primary' : 'secondary'} aria-pressed={layer === 'all'} onClick={() => setLayer('all')}>All trades</Button>
              {LAYERS.map((l) => (
                <Button type="button" variant={layer === l.key ? 'primary' : 'secondary'} aria-pressed={layer === l.key} key={l.key} onClick={() => setLayer(l.key)}>
                  <span className="w-2 h-2 rounded-sm" style={{ background: toneVar(l.tone) }} /> {l.label}
                </Button>
              ))}
            </div>
            <div className={styles.twinGrid}>
              {/* The building */}
              <ConstructionPanel>
                <div className={styles.header}><CardHeader title="The building" subtitle="Select a level to inspect its recorded trade progress. This is a data visualisation, not a connected BIM or live sensor feed." /></div>
                <div className={styles.scroll} role="region" aria-label="Building levels and trade progress, horizontally scrollable" tabIndex={0}><div className={`${styles.body} ${styles.twinCanvas}`}><div className={styles.stack}>
                  {ordered.map((z) => {
                    const pct = shown(z);
                    const active = z.id === sel;
                    return (
                      <Button variant="ghost" aria-pressed={active} aria-label={`${z.label}, ${pct}% complete, ${z.openIssues} open issues, ${z.openRfis} unanswered RFIs`} type="button" key={z.id} onClick={() => setSel(active ? null : z.id)} className={styles.twinLevel}>
                        <span className={styles.twinRow}>
                          <span className={styles.levelNumber}>L{z.level}</span>
                          <span className={styles.levelContent}><span className={styles.rowTitle}>{z.label}</span>
                          <span className={styles.slab} style={{ borderColor: active ? 'var(--primary)' : 'transparent' }}>
                            {layer === 'all' ? (
                              // Stacked slab: each trade shown in sequence across the floor plate.
                              <span className={styles.slabFill}>
                                {LAYERS.map((l) => (
                                  <span key={l.key} className={styles.slabTrade}>
                                    <span className={styles.slabProgress} style={{ width: `${z.layers[l.key]}%`, background: `color-mix(in srgb, ${toneVar(l.tone)} 60%, transparent)` }} />
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span className={styles.slabProgress} style={{ width: `${pct}%`, background: `color-mix(in srgb, ${toneVar(LAYERS.find((l) => l.key === layer)!.tone)} 60%, transparent)` }} />
                            )}
                            <span className={styles.slabLabels}>
                              <span>{layer === 'all' ? 'All trades' : LAYERS.find((l) => l.key === layer)?.label}</span>
                              {z.openIssues > 0 && <StatusPill status={`${z.openIssues} issues`} tone="danger" />}
                              {z.openRfis > 0 && <StatusPill status={`${z.openRfis} RFIs`} tone="warn" />}
                              <span style={{ color: toneVar(z.band) }}>{pct}%</span>
                            </span>
                          </span></span>
                        </span>
                      </Button>
                    );
                  })}
                  {ordered.length === 0 && <ConstructionEmpty title="No building levels recorded" />}
                  {/* Ground line */}
                  <div className="flex items-center gap-2 mt-1"><span className="w-6 flex-none" /><div className="flex-1 h-px bg-border-2" /></div>
                </div></div></div>
                {layer === 'all' && <div className={`${styles.body} ${styles.inline}`}>{LAYERS.map((l) => <StatusPill key={l.key} status={l.label} tone={l.tone} />)}<span className={styles.metadata}>Each quarter of the bar is one trade.</span></div>}
              </ConstructionPanel>

              {/* Level detail */}
              <ConstructionPanel className={`${styles.body} ${styles.section}`}>
                {zone ? (
                  <>
                    <CardHeader title={zone.label} subtitle={`${zone.block} · ${zone.progress}% recorded progress`} />
                    <div className={styles.stack}>
                      {LAYERS.map((l) => (
                        <div key={l.key}>
                          <div className={styles.barLabel}><span>{l.label}</span><span>{zone.layers[l.key]}%</span></div>
                          <div className={styles.bar} role="img" aria-label={`${l.label}: ${zone.layers[l.key]}% recorded progress`}><div style={{ width: `${zone.layers[l.key]}%`, background: toneVar(l.tone) }} /></div>
                        </div>
                      ))}
                    </div>
                    {zone.tasks.length > 0 && (
                      <>
                        <h3 className={styles.title}>Work here</h3>
                        <div className={styles.stack}>
                          {zone.tasks.map((t) => (
                            <div key={t.name} className={styles.fieldSection}>
                              <p className={styles.text}>{t.name}</p>
                              <div className={styles.inline}><span className={styles.text}>{t.percentComplete}% complete</span><StatusPill status={humanizeStatus(t.status)} tone={t.status === 'blocked' ? 'danger' : t.status === 'done' ? 'success' : 'info'} /></div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {(zone.openIssues > 0 || zone.openRfis > 0) && (
                      <div className={`${styles.footer} ${styles.text}`}>
                        {zone.openIssues > 0 && <div>{zone.openIssues} open issue{zone.openIssues === 1 ? '' : 's'} pinned here</div>}
                        {zone.openRfis > 0 && <div>{zone.openRfis} unanswered RFI{zone.openRfis === 1 ? '' : 's'} blocking work</div>}
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState icon={<Layers size={24} />} title="Pick a level" description="See its recorded trade breakdown, complete task names, open issues and unanswered RFIs." />
                )}
              </ConstructionPanel>
            </div>
          </div>
        },
        {
          id: 'overview', label: 'Overview', content: <div className="pb-section">
            <div className={styles.metrics}>
              <Kpi label="Levels" value={String(kpis.levels)} tone="info" icon={<Layers size={16} />} />
              <Kpi label="Structurally done" value={`${kpis.topped}/${kpis.levels}`} tone="progress" icon={<Building2 size={16} />} />
              <Kpi label="Average progress" value={`${kpis.avgProgress}%`} tone={kpis.avgProgress >= 60 ? 'success' : 'warn'} icon={<Layers size={16} />} />
              <Kpi label="Open issues" value={String(kpis.openIssues)} tone={kpis.openIssues ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
            </div>
          </div>
        }
      ]} />

      {/* Layer filter */}

    </ConstructionFrame>
  );
}
