'use client';

import { ConstructionSearch, ConstructionEmpty, useConstructionSave, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, constructionNaira as naira, ConstructionDialog, ConstructionFrame } from './construction-ui';
import { Button, Card, CardHeader, StatusPill } from '@/components/ui';
import styles from './construction-delivery-polish.module.css';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Check, TrendingUp, Flag, ExternalLink } from 'lucide-react';
import { humanizeStatus, toneVar, type Tone } from '@/lib/status-tones';

import { createProject, type ProjectInput } from '@/server/actions/construction';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';

export type ProjectCard = {
  id: string; name: string; code: string; location: string; clientName: string; pmName: string; status: string;
  contractMinor: number; budgetMinor: number; committedMinor: number; actualMinor: number;
  percentComplete: number; plannedPercent: number; cpi: number; spi: number; healthScore: number; healthBand: Tone; healthLabel: string;
  startISO: string; plannedFinishISO: string; forecastFinishISO: string; slipDays: number;
  milestones: { name: string; dueISO: string; band: Tone; status: string }[];
  investorProjectId?: string;
};

const STATUS_TONE: Record<string, Tone> = { planning: 'info', active: 'progress', on_hold: 'warn', closing: 'success', completed: 'muted' };
const displayDate = (value: string) => new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

export function ProjectsWorkspace({ projects, kpis, canMutate }: {
  projects: ProjectCard[];
  kpis: { total: number; contractMinor: number; budgetMinor: number; committedMinor: number };
  canMutate: boolean;
}) {
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const shown = projects.filter((project) => `${project.name} ${project.code} ${project.location} ${project.clientName} ${project.pmName}`.toLowerCase().includes(query.trim().toLowerCase()));
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  return (
    <ConstructionFrame>
      <PageHeader title="Projects" subtitle="Delivery, cost commitments and milestone outlook across the portfolio." actions={canMutate ? <Button variant="primary" type="button" onClick={() => setShowNew(true)} ><Plus size={14} /> New project</Button> : undefined} />

      <PageTabs label="Construction project sections" items={[
        {
          id: 'register', label: 'Project register', content: <div className={styles.stack}>
            <ConstructionSearch label="Search construction projects" value={query} onChange={setQuery} count={shown.length} />
            <div className={styles.stack}>
              {shown.map((p) => (
                <ConstructionPanel key={p.id}>
                  <div className={styles.header}><CardHeader title={p.name} subtitle={`${p.code} · ${p.location}`} action={<div className={styles.inline}><StatusPill status={humanizeStatus(p.status)} tone={STATUS_TONE[p.status] ?? 'muted'} /><HealthRing score={p.healthScore} band={p.healthBand} label={p.healthLabel} /></div>} /></div>
                  <div className={`${styles.body} ${styles.stack}`}>
                  <dl className={styles.facts}><div><dt>Client</dt><dd>{p.clientName}</dd></div><div><dt>Project manager</dt><dd>{p.pmName}</dd></div></dl>
                  {p.investorProjectId && <Link href="/investors" className={styles.link}><ExternalLink size={16} /> Linked to the off-plan sales portfolio</Link>}

                  {/* Progress */}
                  <div>
                    <div className={styles.barLabel}><span>Recorded physical progress</span><span>{p.percentComplete}% / {p.plannedPercent}% planned</span></div>
                    <div className={styles.bar} role="img" aria-label={`${p.percentComplete}% recorded progress, ${p.plannedPercent}% planned`}>
                      <div style={{ width: `${p.percentComplete}%`, background: toneVar(p.percentComplete >= p.plannedPercent ? 'success' : 'warn') }} />
                      <span className="absolute top-[-2px] bottom-[-2px] w-px bg-text" style={{ left: `${p.plannedPercent}%` }} />
                    </div>
                  </div>

                  <dl className={`${styles.facts} ${styles.factsFour}`}>
                    <Mini label="Contract" value={naira(p.contractMinor)} />
                    <Mini label="Budget" value={naira(p.budgetMinor)} />
                    <Mini label="Committed" value={naira(p.committedMinor)} tone={p.committedMinor > p.budgetMinor ? 'danger' : undefined} />
                    <Mini label="Actual" value={naira(p.actualMinor)} />
                  </dl>

                  <dl className={styles.facts}><div><dt>Start · WAT</dt><dd>{displayDate(p.startISO)}</dd></div><div><dt>Planned finish · WAT</dt><dd>{displayDate(p.plannedFinishISO)}</dd></div><div><dt>Estimated finish · WAT</dt><dd>{displayDate(p.forecastFinishISO)}{p.slipDays > 0 ? ` (+${p.slipDays} days)` : ' · on recorded plan'}</dd></div></dl>
                  <div className={styles.inline}>
                      <Chip label={`CPI ${p.cpi.toFixed(2)}`} tone={p.cpi >= 1 ? 'success' : p.cpi >= 0.9 ? 'warn' : 'danger'} />
                      <Chip label={`SPI ${p.spi.toFixed(2)}`} tone={p.spi >= 1 ? 'success' : p.spi >= 0.9 ? 'warn' : 'danger'} />
                  </div>

                  {p.milestones.length > 0 && (
                    <div className={`${styles.footer} ${styles.stack}`}><h3 className={styles.title}>Milestones</h3>
                      {p.milestones.map((m) => (
                        <div key={m.name} className={styles.toolbar}><div><p className={styles.rowTitle}>{m.name}</p><p className={styles.metadata}>Due {displayDate(m.dueISO)} · WAT</p></div><StatusPill status={humanizeStatus(m.status)} tone={m.band} /></div>
                      ))}
                    </div>
                  )}
                  </div>
                </ConstructionPanel>
              ))}
              {shown.length === 0 && <ConstructionEmpty title="No matching projects" />}
            </div>
          </div>
        },
        {
          id: 'overview', label: 'Portfolio overview', content: <div className="pb-section">
            <div className={styles.metrics}>
              <Kpi label="Projects" value={String(kpis.total)} tone="info" icon={<Building2 size={16} />} />
              <Kpi label="Contract value" value={naira(kpis.contractMinor)} tone="progress" icon={<TrendingUp size={16} />} />
              <Kpi label="Approved budget" value={naira(kpis.budgetMinor)} tone="info" icon={<Flag size={16} />} />
              <Kpi label="Committed" value={naira(kpis.committedMinor)} tone={kpis.committedMinor > kpis.budgetMinor ? 'danger' : 'success'} icon={<Check size={16} />} />
            </div>
          </div>
        }
      ]} />

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} onDone={(n) => { setShowNew(false); flash(`Project created · ${n}`); }} />}
      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </ConstructionFrame>
  );
}

function NewProjectDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: string) => void }) {
  const router = useRouter();
  const [f, setF] = useState<ProjectInput>({ name: '', location: '', clientName: '', contractNaira: 0, budgetNaira: 0, plannedFinishISO: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const set = (k: keyof ProjectInput, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await createProject(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? f.name); }); }
  return (
    <ConstructionDialog title={"New project"} onClose={onClose} pending={pending}>
      <div className={styles.stack}>
        <Card><CardHeader title="Planning record" subtitle="Review the project identity, exact NGN amounts and operating finish date." /></Card>
        <label className={styles.field}>Name<input aria-label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="e.g. Harbour Point Phase 1" /></label>
        <div className={styles.formGrid}>
          <label className={styles.field}>Location<input aria-label="Location" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Lekki, Lagos" /></label>
          <label className={styles.field}>Client<input aria-label="Client" value={f.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Client or project owner" /></label>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>Contract (₦)<input aria-label="Contract (₦)" type="number" min="0" step="0.01" value={f.contractNaira || ''} onChange={(e) => set('contractNaira', Number(e.target.value) || 0)} inputMode="decimal" /></label>
          <label className={styles.field}>Budget (₦)<input aria-label="Budget (₦)" type="number" min="0" step="0.01" value={f.budgetNaira || ''} onChange={(e) => set('budgetNaira', Number(e.target.value) || 0)} inputMode="decimal" /></label>
        </div>
        <label className={styles.field}>Planned finish · WAT date<input aria-label="Planned finish" type="date" value={f.plannedFinishISO} onChange={(e) => set('plannedFinishISO', e.target.value)} /></label>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <p className={styles.notice}>Creates a planning record in NGN. Review the client, location, contract value, budget and finish date before confirming.</p>
      <div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose} >Cancel</Button><Button variant="primary" type="button" onClick={submit} disabled={pending || !f.name.trim() || !f.location.trim() || !f.clientName.trim() || !f.plannedFinishISO || f.contractNaira < 0 || f.budgetNaira < 0} >{pending ? 'Creating…' : 'Create project'}</Button></div></div>
    </ConstructionDialog>
  );
}
function HealthRing({ score, band, label }: { score: number; band: Tone; label: string }) {
  const color = toneVar(band);
  return (
    <div className={styles.inline} role="img" aria-label={`${score} rule-based health score: ${label}, not independent site verification`}>
      <div className="relative" style={{ width: 54, height: 54 }}>
        <svg width={54} height={54} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-[14px] font-bold" style={{ color }}>{score}</span></div>
      </div>
      <span className="text-[14px] font-medium" style={{ color }}>{label}</span>
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return <div><dt>{label} · NGN</dt><dd style={tone ? { color: toneVar(tone) } : undefined}>{value}</dd></div>;
}
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return <StatusPill status={label} tone={tone} />;
}
