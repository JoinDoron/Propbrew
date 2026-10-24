'use client';

import styles from './construction-commercial-polish.module.css';

import { ConstructionSearch, useConstructionSave, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, constructionNaira as naira, ConstructionDialog, ConstructionFrame, ConstructionPanelHeader } from './construction-ui';
import { IconButton, Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, ArrowLeftRight, Undo2, ClipboardList, Check, TriangleAlert, History } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { STOCK_KIND_LABEL, countVariance, type StockKind } from '@/domain/construction';
import { transferStock, returnStock, recordStockCount, reconcileStockCount } from '@/server/actions/construction';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';

export type StockLine = { materialId: string; name: string; sku: string; unit: string; warehouseId: string; warehouseName: string; onHand: number; reserved: number; unitCostMinor: number };
export type WarehouseOpt = { id: string; name: string };
export type CountRow = { id: string; ref: string; materialName: string; unit: string; warehouseName: string; systemQty: number; countedQty: number; countedBy: string; countedISO: string; status: string; reasonLabel?: string; note?: string };
export type LedgerRow = { id: string; kind: StockKind; materialName: string; qty: number; unit: string; atISO: string; by: string; ref?: string; runningQty: number };
export type ReasonOpt = { id: string; label: string; requiresNote: boolean };

const KIND_TONE: Record<StockKind, Tone> = { receipt: 'success', issue: 'progress', transfer: 'info', return: 'warn', adjust: 'danger' };
const timestampLabel = (iso: string) => { const at = new Date(iso); return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(iso.includes('T') ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}), timeZone: 'Africa/Lagos' })} WAT`; };

export function StockWorkspace({ lines, warehouses, counts, ledger, adjustReasons, returnReasons, kpis, canMutate, canCreate = false }: {
  lines: StockLine[]; warehouses: WarehouseOpt[]; counts: CountRow[]; ledger: LedgerRow[];
  adjustReasons: ReasonOpt[]; returnReasons: ReasonOpt[];
  kpis: { valueMinor: number; openCounts: number; varianceQty: number; movements: number };
  canMutate: boolean;
  canCreate?: boolean;
}) {
  const [dialog, setDialog] = useState<null | { kind: 'transfer' | 'return' | 'count'; line: StockLine }>(null);
  const [reconcileFor, setReconcileFor] = useState<CountRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const shown = lines.filter((line) => `${line.name} ${line.sku} ${line.warehouseName}`.toLowerCase().includes(query.trim().toLowerCase()));
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };

  return (
    <ConstructionFrame><div className={styles.workspace}>
      <PageHeader title="Stock &amp; stores" subtitle="Track store balances, transfers, physical counts and reconciliation." />

      <PageTabs label="Construction stock sections" items={[
        {
          id: 'stock', label: 'Stock by store', content: <div className="pb-section">
            <ConstructionSearch label="Search stock and stores" value={query} onChange={setQuery} count={shown.length} />
            <ConstructionPanel className="pb-table-frame">
              <ConstructionPanelHeader title="Stock by store"></ConstructionPanelHeader>
              <div role="region" tabIndex={0} aria-label="Construction stock by store · scroll horizontally" className={styles.scroll}>
                <table aria-label="Construction stock by store" className={`pb-data-table ${styles.table}`}>
                  <thead><tr>{['Material', 'Store', 'On hand', 'Available', 'Value', 'Actions'].map((h, i) => <th scope="col" key={h || i} className={`text-[12px] font-medium uppercase text-text-3 px-6 py-4 border-b border-border ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map((l) => (
                      <tr key={`${l.materialId}-${l.warehouseId}`} className="hover:bg-surface-2">
                        <th scope="row"><div className={styles.title}>{l.name}</div><p className={styles.metadata}>{l.sku}</p><p className={styles.metadata}>Unit cost {naira(l.unitCostMinor)} / {l.unit}</p></th>
                        <td className="px-6 py-4 border-b border-border text-[14px] text-text-3">{l.warehouseName}</td>
                        <td className={styles.numeric}>{l.onHand} {l.unit}</td>
                        <td className={styles.numeric}>{l.onHand - l.reserved} {l.unit}<p className={styles.metadata}>{l.reserved} reserved</p></td>
                        <td className={styles.numeric}>{naira(l.onHand * l.unitCostMinor)}</td>
                        <td className="px-6 py-4 border-b border-border text-right">
                          {(canMutate || canCreate) && (
                            <div className="inline-flex gap-1">
                              {canMutate && <IconButton aria-label={`Transfer ${l.name} to another store`} type="button" onClick={() => setDialog({ kind: 'transfer', line: l })} title="Transfer to another store" ><ArrowLeftRight size={12} /></IconButton>}
                              {canMutate && <IconButton aria-label={`Return ${l.name} from site`} type="button" onClick={() => setDialog({ kind: 'return', line: l })} title="Return from site" ><Undo2 size={12} /></IconButton>}
                              {canCreate && <IconButton aria-label={`Physical count of ${l.name}`} type="button" onClick={() => setDialog({ kind: 'count', line: l })} title="Physical count" ><ClipboardList size={12} /></IconButton>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && <tr><td colSpan={6} className="text-center text-text-3">No stock lines match this search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'counts', label: 'Count reconciliation', count: kpis.openCounts, content: <div className="pb-section">{!counts.some((c) => c.status === 'open') && <p className="rounded-xl border border-dashed border-border p-5 text-[14px] text-text-3">No stock counts are awaiting reconciliation.</p>}{counts.some((c) => c.status === 'open') && (
            <ConstructionPanel className="p-4" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' }}>
              <div className="text-[14px] font-medium mb-1 flex items-center gap-1.5" style={{ color: toneVar('warn') }}><ClipboardList size={14} /> Counts awaiting reconciliation</div>
              <p className="text-[14px] text-text-3 mb-2.5">Counting and adjusting are deliberately separate: a variance only moves the books once someone codes <em>why</em>.</p>
              <div className="flex flex-col gap-2">
                {counts.filter((c) => c.status === 'open').map((c) => {
                  const v = countVariance(c.systemQty, c.countedQty);
                  return (
                    <ConstructionPanel key={c.id} className="bg-surface rounded-xl border border-border p-3 flex items-center gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium"><span className="font-mono text-[14px]">{c.ref}</span> {c.materialName}</div>
                        <p className={styles.metadata}>{c.warehouseName}</p><dl className={styles.facts}><div><dt>System quantity</dt><dd>{c.systemQty} {c.unit}</dd></div><div><dt>Counted quantity</dt><dd>{c.countedQty} {c.unit}</dd></div><div><dt>Counted by</dt><dd>{c.countedBy}</dd></div><div><dt>Recorded at</dt><dd><time dateTime={c.countedISO}>{timestampLabel(c.countedISO)}</time></dd></div></dl>
                      </div>
                      <span className="text-[12px] font-bold font-mono flex-none" style={{ color: toneVar(v.band) }}>{v.deltaQty >= 0 ? '+' : ''}{v.deltaQty} {c.unit}</span>
                      {canMutate && <Button variant="primary" type="button" onClick={() => setReconcileFor(c)} className="flex-none">Reconcile</Button>}
                    </ConstructionPanel>
                  );
                })}
              </div>
            </ConstructionPanel>
          )}<CountHistory counts={counts.filter((count) => count.status !== 'open')} /></div>
        },
        {
          id: 'ledger', label: 'Perpetual ledger', content: <div className="pb-section">
            <ConstructionPanel >
              <ConstructionPanelHeader title="Perpetual ledger"><span className="text-[12px] text-text-3 font-normal">· every movement, with the running balance it produced</span></ConstructionPanelHeader>
              <div role="region" tabIndex={0} aria-label="Stock movement ledger" className={styles.scroll}>
                {ledger.length ? <table className={styles.table}><caption className="sr-only">Every recorded stock movement and its running quantity</caption><thead><tr><th scope="col">Material</th><th scope="col">Movement</th><th scope="col">Recorded at · WAT</th><th scope="col">Reference</th><th scope="col">Recorded by</th><th scope="col" className={styles.numeric}>Quantity</th><th scope="col" className={styles.numeric}>Running balance</th></tr></thead><tbody>{ledger.map((movement) => <tr key={movement.id}><th scope="row">{movement.materialName}</th><td><StatusPill status={STOCK_KIND_LABEL[movement.kind]} tone={KIND_TONE[movement.kind]} /></td><td><time dateTime={movement.atISO}>{timestampLabel(movement.atISO)}</time></td><td>{movement.ref || 'Not recorded'}</td><td>{movement.by}</td><td className={styles.numeric}>{movement.kind === 'receipt' || movement.kind === 'return' ? '+' : '−'}{movement.qty} {movement.unit}</td><td className={styles.numeric}>{movement.runningQty} {movement.unit}</td></tr>)}</tbody></table> : <div className={styles.body}><EmptyState title="No stock movements recorded" description="Receipts, issues, returns and adjustments appear here when recorded in the current scope." /></div>}
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'overview', label: 'Overview', content: <div className="pb-section">
            <div className="grid grid-cols-1 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-6">
              <Kpi label="Stock value" value={naira(kpis.valueMinor)} tone="info" icon={<Boxes size={16} />} />
              <Kpi label="Open counts" value={String(kpis.openCounts)} tone={kpis.openCounts ? 'warn' : 'success'} icon={<ClipboardList size={16} />} />
              <Kpi label="Unreconciled variance" value={String(kpis.varianceQty)} tone={kpis.varianceQty ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
              <Kpi label="Movements" value={String(kpis.movements)} tone="progress" icon={<History size={16} />} />
            </div>
          </div>
        }
      ]} />

      {/* Open counts needing a reason */}

      {/* Stock positions */}

      {/* Perpetual ledger */}

      {dialog?.kind === 'transfer' && <TransferDialog line={dialog.line} warehouses={warehouses} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); }} />}
      {dialog?.kind === 'return' && <ReturnDialog line={dialog.line} reasons={returnReasons} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); }} />}
      {dialog?.kind === 'count' && <CountDialog line={dialog.line} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); }} />}
      {reconcileFor && <ReconcileDialog count={reconcileFor} reasons={adjustReasons} onClose={() => setReconcileFor(null)} onDone={(m) => { setReconcileFor(null); flash(m); }} />}
      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </div></ConstructionFrame>
  );
}

function TransferDialog({ line, warehouses, onClose, onDone }: { line: StockLine; warehouses: WarehouseOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const others = warehouses.filter((w) => w.id !== line.warehouseId);
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  function submit() { setError(null); start(async () => { const r = await transferStock(line.materialId, line.warehouseId, to, Number(qty)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Transferred · ${r.ref}`); }); }
  return (
    <Modal pending={pending} title="Transfer stock" onClose={onClose}>
      <Sub line={line} />
      <label htmlFor={`${fieldId}-store`} className="pb-form-label">To store</label>
      <select id={`${fieldId}-store`} aria-label="To store" value={to} onChange={(e) => setTo(e.target.value)} className={styles.control}><option value="">Choose a destination store</option>{others.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      <label htmlFor={`${fieldId}-quantity`} className="pb-form-label">Quantity · {line.unit}</label>
      <input id={`${fieldId}-quantity`} aria-label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" type="number" min="0" step="any" className={styles.control} autoFocus />
      <p className="text-[12px] text-text-3 mt-1.5">Blocked above {line.onHand} — a transfer can never drive the source store negative.</p>
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={!(Number(qty) > 0) || Number(qty) > line.onHand || !to} label="Confirm transfer" />
    </Modal>
  );
}

function ReturnDialog({ line, reasons, onClose, onDone }: { line: StockLine; reasons: ReasonOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const [qty, setQty] = useState('1');
  const [codeId, setCodeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const code = reasons.find((r) => r.id === codeId);
  function submit() { setError(null); start(async () => { const r = await returnStock(line.materialId, line.warehouseId, Number(qty), codeId, note); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Returned · ${r.ref}`); }); }
  return (
    <Modal pending={pending} title="Return from site" onClose={onClose}>
      <Sub line={line} />
      <label htmlFor={`${fieldId}-quantity`} className="pb-form-label">Quantity returned · {line.unit}</label>
      <input id={`${fieldId}-quantity`} aria-label="Quantity returned" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" type="number" min="0" step="any" className={styles.control} autoFocus />
      <label htmlFor={`${fieldId}-reason`} className="pb-form-label">Reason · required</label>
      <select id={`${fieldId}-reason`} aria-label="Reason · required" value={codeId} onChange={(e) => setCodeId(e.target.value)} className={styles.control}><option value="">Choose the recorded reason</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      {code?.requiresNote && <><label htmlFor={`${fieldId}-note`} className="pb-form-label">Note · required</label><input id={`${fieldId}-note`} aria-label="Required return reason note" value={note} onChange={(e) => setNote(e.target.value)} className={styles.control} /></>}
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={!(Number(qty) > 0) || !codeId || (!!code?.requiresNote && !note.trim())} label="Confirm return" />
    </Modal>
  );
}

function CountDialog({ line, onClose, onDone }: { line: StockLine; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const v = countVariance(line.onHand, Number(counted) || 0);
  function submit() { setError(null); start(async () => { const r = await recordStockCount(line.materialId, line.warehouseId, Number(counted)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Count recorded · ${r.ref}`); }); }
  return (
    <Modal pending={pending} title="Physical count" onClose={onClose}>
      <Sub line={line} />
      <label htmlFor={fieldId} className="pb-form-label">Counted quantity · {line.unit}</label>
      <input id={fieldId} aria-label="Counted quantity" value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" type="number" min="0" step="any" className={styles.control} autoFocus />
      <div className="mt-2 text-[12px]" style={{ color: toneVar(counted === '' ? 'muted' : v.band) }}>
        {counted === '' ? 'Enter the physical count to compare it with the recorded quantity.' : v.direction === 'exact' ? 'Matches the system figure exactly.' : `${v.deltaQty > 0 ? '+' : ''}${v.deltaQty} ${line.unit} (${v.pct}% ${v.direction})`}
      </div>
      <p className="text-[12px] text-text-3 mt-1.5">Recording a count never moves stock on its own — you reconcile it with a coded reason afterwards.</p>
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={counted === '' || Number(counted) < 0} label="Confirm physical count" />
    </Modal>
  );
}

function ReconcileDialog({ count, reasons, onClose, onDone }: { count: CountRow; reasons: ReasonOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const [codeId, setCodeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const code = reasons.find((r) => r.id === codeId);
  const v = countVariance(count.systemQty, count.countedQty);
  function submit() { setError(null); start(async () => { const r = await reconcileStockCount(count.id, codeId, note); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Reconciled · ${r.ref}`); }); }
  return (
    <Modal pending={pending} title="Reconcile count" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[14px]">
        <div className="font-medium">{count.ref} · {count.materialName}</div>
        <div className="text-text-3">system {count.systemQty} → counted {count.countedQty} {count.unit}</div>
        <div className="mt-1 font-medium" style={{ color: toneVar(v.band) }}>{v.deltaQty >= 0 ? '+' : ''}{v.deltaQty} {count.unit} will be written to stock</div>
      </div>
      <label htmlFor={`${fieldId}-reason`} className="pb-form-label">Reason · required</label>
      <select id={`${fieldId}-reason`} aria-label="Reason · required" value={codeId} onChange={(e) => setCodeId(e.target.value)} className={styles.control}><option value="">Choose the recorded reason</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      {code?.requiresNote && <><label htmlFor={`${fieldId}-note`} className="pb-form-label">Note · required</label><input id={`${fieldId}-note`} aria-label="Required reconciliation reason note" value={note} onChange={(e) => setNote(e.target.value)} className={styles.control} autoFocus /></>}
      <p className="text-[12px] text-text-3 mt-1.5">The adjustment, its reason and the before/after figures all land in the audit trail.</p>
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={!codeId || (!!code?.requiresNote && !note.trim())} label="Reconcile" />
    </Modal>
  );
}

function Sub({ line }: { line: StockLine }) {
  return <div className={styles.notice}><div><p className={styles.title}>{line.name}</p><p className={styles.metadata}>{line.sku} · {line.warehouseName}</p><dl className={styles.facts}><div><dt>On hand</dt><dd>{line.onHand} {line.unit}</dd></div><div><dt>Available</dt><dd>{line.onHand - line.reserved} {line.unit}</dd></div><div><dt>Unit cost · NGN</dt><dd>{naira(line.unitCostMinor)}</dd></div></dl></div></div>;
}

function CountHistory({ counts }: { counts: CountRow[] }) {
  return <ConstructionPanel><div className={styles.header}><CardHeader title="Recorded count history" subtitle="Non-open count records · reasons and notes retained; no new adjustment is made here" /></div>{counts.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Recorded stock count history, horizontally scrollable"><table className={`${styles.table} ${styles.wideTable}`}><thead><tr><th scope="col">Count / material</th><th scope="col">Store</th><th scope="col">System / counted</th><th scope="col">Recorded by / at</th><th scope="col">Status</th><th scope="col">Reason / note</th></tr></thead><tbody>{counts.map((count) => <tr key={count.id}><th scope="row">{count.ref}<p className={styles.metadata}>{count.materialName}</p></th><td>{count.warehouseName}</td><td>{count.systemQty} / {count.countedQty} {count.unit}</td><td>{count.countedBy}<p><time dateTime={count.countedISO}>{timestampLabel(count.countedISO)}</time></p></td><td><StatusPill status={count.status} tone="neutral" /></td><td className={styles.note}>{count.reasonLabel || 'No reason recorded'}<p className={styles.metadata}>{count.note || 'No note recorded'}</p></td></tr>)}</tbody></table></div> : <div className={styles.body}><EmptyState title="No completed count records" description="Non-open count history will appear here when records are available in your current scope." /></div>}</ConstructionPanel>;
}
function Actions({ pending, onClose, onSubmit, disabled, label }: { pending: boolean; onClose: () => void; onSubmit: () => void; disabled: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <Button type="button" disabled={pending} onClick={onClose} >Cancel</Button>
      <Button variant="primary" type="button" onClick={onSubmit} disabled={pending || disabled} ><Check size={13} /> {pending ? 'Saving…' : label}</Button>
    </div>
  );
}
function Modal({ title, children, onClose, pending = false }: { title: string; children: React.ReactNode; onClose: () => void; pending?: boolean }) { return <ConstructionDialog title={title} onClose={onClose} pending={pending}>{children}</ConstructionDialog>; }
