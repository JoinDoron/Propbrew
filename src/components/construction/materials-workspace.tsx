'use client';

import styles from './construction-commercial-polish.module.css';

import { useConstructionSave, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, constructionNaira as naira, ConstructionDialog, ConstructionFrame, ConstructionPanelHeader, ConstructionEmpty } from './construction-ui';
import { Button, CardHeader, EmptyState } from '@/components/ui';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, TriangleAlert, ArrowDownUp, Search, Fuel, Boxes, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { stockMovementQuantity, type StockKind } from '@/domain/construction';

import { issueMaterials } from '@/server/actions/construction';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';

export type MaterialRow = {
  id: string; sku: string; name: string; category: string; unit: string; onHand: number; reserved: number; inTransit: number;
  reorderLevel: number; unitCostMinor: number; belowReorder: boolean; daysCover: number | null; band: Tone;
  receivedQty: number; issuedQty: number; leakageQty: number; leakagePct: number; anomalous: boolean; leakageValueMinor: number;
};
export type TrailNodeRow = { id: string; label: string; minor: number; tone: Tone };
export type MovementRow = { id: string; materialName: string; kind: StockKind; qty: number; unit: string; atISO: string; ref?: string; by: string };

const KIND_TONE: Record<string, Tone> = { receipt: 'success', issue: 'progress', transfer: 'info', return: 'warn', adjust: 'danger' };
const timestampLabel = (iso: string) => { const at = new Date(iso); return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(iso.includes('T') ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}), timeZone: 'Africa/Lagos' })} WAT`; };

export function MaterialsWorkspace({ materials, trail, movements, projectName, kpis, canMutate, projectId, projects }: {
  materials: MaterialRow[]; trail: TrailNodeRow[]; movements: MovementRow[]; projectName: string;
  kpis: { stockValueMinor: number; belowReorder: number; leakageValueMinor: number; anomalies: number };
  canMutate: boolean; projectId: string; projects?: { id: string; name: string }[];
}) {
  const [q, setQ] = useState('');
  const [issueFor, setIssueFor] = useState<MaterialRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const shown = materials.filter((m) => !q.trim() || `${m.name} ${m.sku}`.toLowerCase().includes(q.toLowerCase()));
  const maxTrail = Math.max(1, ...trail.map((t) => t.minor));

  return (
    <ConstructionFrame><div className={styles.workspace}>
      <PageHeader title="Materials &amp; money trail" subtitle="Monitor stock, movements and material variances across the build." />
      {materials.some((m) => m.anomalous) && (
        <ConstructionPanel className="p-4" style={{ borderColor: 'color-mix(in srgb, var(--tone-danger) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' }}>
          <div className="flex items-center gap-2 text-[14px] font-medium mb-1" style={{ color: toneVar('danger') }}><TriangleAlert size={14} /> Leakage detected — advisory</div>
          <p className="text-[14px] text-text-3 mb-3">Received minus issued minus counted stock leaves a gap. This is a prompt to run a stock count and record a reason — <span className="font-medium">not an accusation</span>.</p>
          <div className="flex flex-col gap-2">
            {materials.filter((m) => m.anomalous).map((m) => (
              <ConstructionPanel key={m.id} className="bg-surface rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[14px] font-medium">{m.name}</div>
                  <div className="text-[14px] font-bold" style={{ color: toneVar('danger') }}>{m.leakageQty} {m.unit} · {naira(m.leakageValueMinor)}</div>
                </div>
                <div className="grid grid-cols-2 min-[640px]:grid-cols-4 gap-4 mt-4 text-[12px]">
                  <Segment label={`received ${m.receivedQty}`} width={100} tone="success" />
                  <Segment label={`issued ${m.issuedQty}`} width={Math.round((m.issuedQty / Math.max(1, m.receivedQty)) * 100)} tone="progress" />
                  <Segment label={`on hand ${m.onHand}`} width={Math.round((m.onHand / Math.max(1, m.receivedQty)) * 100)} tone="info" />
                  <Segment label={`gap ${m.leakagePct}%`} width={m.leakagePct} tone="danger" />
                </div>
              </ConstructionPanel>
            ))}
          </div>
        </ConstructionPanel>
      )}

      <PageTabs label="Construction material sections" items={[
        {
          id: 'stock', label: 'Materials register', content: <div className="pb-section">
            <ConstructionPanel className="pb-table-frame">
              <ConstructionPanelHeader title="Stock on hand"><div className="pb-search ml-auto flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border-2"><Search size={13} className="text-text-3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="bg-transparent outline-none text-[12px] w-28" aria-label="Search materials" /></div></ConstructionPanelHeader>
              <div role="region" tabIndex={0} aria-label="Construction materials register · scroll horizontally" className={styles.scroll}>
                <table aria-label="Construction materials register" className={`pb-data-table ${styles.table}`}>
                  <thead><tr>{['Material', 'On hand', 'Available', 'In transit', 'Cover', 'Actions'].map((h, i) => <th scope="col" key={h || i} className={`text-[12px] font-medium uppercase text-text-3 px-6 py-4 border-b border-border ${i === 0 ? 'text-left' : i === 5 ? 'text-right' : 'text-right'}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-2">
                        <th scope="row"><div className={styles.title}>{m.name}</div><p className={styles.metadata}>{m.sku} · {m.category}</p><p className={styles.metadata}>Unit cost: {naira(m.unitCostMinor)} / {m.unit}</p></th>
                        <td className={styles.numeric}><span style={{ color: m.belowReorder ? toneVar('danger') : undefined }}>{m.onHand} {m.unit}</span><p className={styles.metadata}>Reorder at {m.reorderLevel} {m.unit}</p></td>
                        <td className={styles.numeric}>{m.onHand - m.reserved} {m.unit}<p className={styles.metadata}>{m.reserved} reserved</p></td>
                        <td className="px-6 py-4 border-b border-border text-right text-[12px] font-mono text-text-3">{m.inTransit || '—'}</td>
                        <td className="px-6 py-4 border-b border-border text-right"><span className="text-[14px] font-semibold px-2 h-5 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(m.band)} 14%, transparent)`, color: toneVar(m.band) }}>{m.belowReorder ? 'reorder' : m.daysCover !== null ? `${m.daysCover}d` : 'ample'}</span></td>
                        <td className="px-6 py-4 border-b border-border text-right">{canMutate && m.onHand > 0 && <Button type="button" onClick={() => setIssueFor(m)} ><ArrowDownUp size={11} /> Issue</Button>}</td>
                      </tr>
                    ))}
                    {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[14px] text-text-3">No materials match.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'overview', label: 'Money trail', content: <div className="pb-section">
            <div className="grid grid-cols-1 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-6">
              <Kpi label="Stock value" value={naira(kpis.stockValueMinor)} tone="info" icon={<Boxes size={16} />} />
              <Kpi label="Below reorder" value={String(kpis.belowReorder)} tone={kpis.belowReorder ? 'danger' : 'success'} icon={<Package size={16} />} />
              <Kpi label="Unaccounted value" value={naira(kpis.leakageValueMinor)} tone={kpis.leakageValueMinor > 0 ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
              <Kpi label="Leakage flags" value={String(kpis.anomalies)} tone={kpis.anomalies ? 'danger' : 'success'} icon={<Fuel size={16} />} />
            </div>
            <ConstructionPanel>
              <div className={styles.header}><CardHeader title={`Money trail · ${projectName}`} subtitle="Recorded NGN · approved → committed → ordered → received → booked as cost" /></div><div className={styles.body}><p className={`${styles.text} mb-6`}>These figures describe the project records, not verified bank settlement. Bar lengths compare recorded amounts; the text gives exact values and conversion ratios.</p>
              <ol className={styles.chartRows}>
                {trail.map((t, i) => (
                  <li key={t.id}>
                    <div className={styles.chartLabel}><strong>{t.label}</strong><span>{naira(t.minor)}</span></div>
                    <div className={styles.bar} role="img" aria-label={`${t.label}: ${naira(t.minor)}`}>
                      <span style={{ width: `${(t.minor / maxTrail) * 100}%`, background: `color-mix(in srgb, ${toneVar(t.tone)} 65%, transparent)` }} />
                    </div>
                      {i > 0 && trail[i - 1].minor > 0 && (
                        <p className={styles.metadata}>{Math.round((t.minor / trail[i - 1].minor) * 100)}% of {trail[i - 1].label.toLowerCase()}</p>
                      )}
                  </li>
                ))}
              </ol>{!trail.length && <EmptyState title="No money-trail records" description="Approved, committed and cost values appear when records are available for this project." />}</div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'movements', label: 'Movement history', content: <div className="pb-section">
            <ConstructionPanel >
              <ConstructionPanelHeader title="Movement history"><span className="text-[12px] text-text-3 font-normal">· recorded receipts and issues in this snapshot</span></ConstructionPanelHeader>
              <div role="region" tabIndex={0} aria-label="Material movement records" className={styles.scroll}>
                {movements.map((m) => (
                  <div key={m.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                    <span className="text-[12px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(KIND_TONE[m.kind] ?? 'muted')} 14%, transparent)`, color: toneVar(KIND_TONE[m.kind] ?? 'muted') }}>{m.kind}</span>
                    <div className={styles.rowMain}><p className={styles.title}>{m.materialName}</p><dl className={styles.facts}><div><dt>Recorded at</dt><dd><time dateTime={m.atISO}>{timestampLabel(m.atISO)}</time></dd></div><div><dt>Source reference</dt><dd>{m.ref || 'Not recorded'}</dd></div><div><dt>Recorded by</dt><dd>{m.by}</dd></div></dl></div>
                    <span className="text-[14px] font-mono font-medium flex-none" style={{ color: toneVar(m.kind === 'receipt' || m.kind === 'return' || m.kind === 'adjust' && m.qty >= 0 ? 'success' : 'progress') }}>{stockMovementQuantity(m.kind, m.qty)} {m.unit}</span>
                  </div>
                ))}
                {movements.length === 0 && <ConstructionEmpty title="No material movements recorded" />}
              </div>
            </ConstructionPanel>
            <div className="text-[14px] text-text-3 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-none" /> Leakage is a variance signal computed from your own movement records — investigate with a stock count before drawing conclusions.</div>
          </div>
        }
      ]} />

      {/* Money trail */}

      {/* Leakage */}

      {/* Stock */}

      {/* Movements */}

      {issueFor && <IssueDialog material={issueFor} projectId={projectId} projects={projects ?? (projectId ? [{ id: projectId, name: projectName }] : [])} onClose={() => setIssueFor(null)} onDone={(m) => { setIssueFor(null); flash(m); }} />}
      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </div></ConstructionFrame>
  );
}

function IssueDialog({ material, projectId, projects, onClose, onDone }: { material: MaterialRow; projectId: string; projects: { id: string; name: string }[]; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const [qty, setQty] = useState('1');
  const [receivingProject, setReceivingProject] = useState(projectId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  function submit() { setError(null); start(async () => { const r = await issueMaterials(material.id, Number(qty), receivingProject); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Issued ${qty} ${material.unit} of ${material.name} to ${projects.find((project) => project.id === receivingProject)?.name ?? 'the selected project'}`); }); }
  return (
    <ConstructionDialog title={"Issue to site"} onClose={onClose} pending={pending}>
      <div className={styles.notice}><div><p className={styles.title}>{material.name}</p><p className={styles.metadata}>{material.sku} · {material.category}</p><dl className={styles.facts}><div><dt>On hand</dt><dd>{material.onHand} {material.unit}</dd></div><div><dt>Reserved</dt><dd>{material.reserved} {material.unit}</dd></div><div><dt>Available</dt><dd>{material.onHand - material.reserved} {material.unit}</dd></div><div><dt>Recorded unit cost</dt><dd>{naira(material.unitCostMinor)}</dd></div></dl></div></div>
      <label htmlFor={fieldId} className="pb-form-label">Quantity to issue · {material.unit}</label>
      <input id={fieldId} aria-label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" type="number" min="0" step="any" className={styles.control} autoFocus />
      <label className="pb-form-label mt-4">Receiving project<select aria-label="Receiving project" value={receivingProject} onChange={(event) => setReceivingProject(event.target.value)} className={styles.control}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <p className="text-[12px] text-text-3 mt-1.5">This issues from the authorised stores represented by the total above. Issuing more than on-hand is blocked; each store remains non-negative.</p>
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><Button type="button" disabled={pending} onClick={onClose} >Cancel</Button><Button variant="primary" type="button" onClick={submit} disabled={pending || !receivingProject || !Number.isFinite(Number(qty)) || Number(qty) <= 0 || Number(qty) > material.onHand} >{pending ? 'Issuing…' : 'Issue'}</Button></div>
    </ConstructionDialog>
  );
}
function Segment({ label, width, tone }: { label: string; width: number; tone: Tone }) {
  return <div className="min-w-0"><div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, width))}%`, background: toneVar(tone) }} /></div><div className="text-text-3 mt-2 break-words">{label}</div></div>;
}
