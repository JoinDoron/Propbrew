'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, ArrowLeftRight, Undo2, ClipboardList, X, Check, TriangleAlert, History } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { STOCK_KIND_LABEL, countVariance, fmtM, type StockKind } from '@/domain/construction';
import { transferStock, returnStock, recordStockCount, reconcileStockCount } from '@/server/actions/construction';

export type StockLine = { materialId: string; name: string; sku: string; unit: string; warehouseId: string; warehouseName: string; onHand: number; reserved: number; unitCostMinor: number };
export type WarehouseOpt = { id: string; name: string };
export type CountRow = { id: string; ref: string; materialName: string; unit: string; warehouseName: string; systemQty: number; countedQty: number; countedBy: string; countedISO: string; status: string; reasonLabel?: string; note?: string };
export type LedgerRow = { id: string; kind: StockKind; materialName: string; qty: number; unit: string; atISO: string; by: string; ref?: string; runningQty: number };
export type ReasonOpt = { id: string; label: string; requiresNote: boolean };

const naira = (m: number) => `₦${fmtM(m)}`;
const KIND_TONE: Record<StockKind, Tone> = { receipt: 'success', issue: 'progress', transfer: 'info', return: 'warn', adjust: 'danger' };

export function StockWorkspace({ lines, warehouses, counts, ledger, adjustReasons, returnReasons, kpis, canMutate }: {
  lines: StockLine[]; warehouses: WarehouseOpt[]; counts: CountRow[]; ledger: LedgerRow[];
  adjustReasons: ReasonOpt[]; returnReasons: ReasonOpt[];
  kpis: { valueMinor: number; openCounts: number; varianceQty: number; movements: number };
  canMutate: boolean;
}) {
  const [dialog, setDialog] = useState<null | { kind: 'transfer' | 'return' | 'count'; line: StockLine }>(null);
  const [reconcileFor, setReconcileFor] = useState<CountRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Stock value" value={naira(kpis.valueMinor)} tone="info" icon={<Boxes size={16} />} />
        <Kpi label="Open counts" value={String(kpis.openCounts)} tone={kpis.openCounts ? 'warn' : 'success'} icon={<ClipboardList size={16} />} />
        <Kpi label="Unreconciled variance" value={String(kpis.varianceQty)} tone={kpis.varianceQty ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
        <Kpi label="Movements" value={String(kpis.movements)} tone="progress" icon={<History size={16} />} />
      </div>

      {/* Open counts needing a reason */}
      {counts.some((c) => c.status === 'open') && (
        <section className="rounded-2xl border p-4" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' }}>
          <div className="text-[12.5px] font-semibold mb-1 flex items-center gap-1.5" style={{ color: toneVar('warn') }}><ClipboardList size={14} /> Counts awaiting reconciliation</div>
          <p className="text-[11px] text-text-3 mb-2.5">Counting and adjusting are deliberately separate: a variance only moves the books once someone codes <em>why</em>.</p>
          <div className="flex flex-col gap-2">
            {counts.filter((c) => c.status === 'open').map((c) => {
              const v = countVariance(c.systemQty, c.countedQty);
              return (
                <div key={c.id} className="bg-surface rounded-xl border border-border p-3 flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium"><span className="font-mono text-[11px]">{c.ref}</span> {c.materialName}</div>
                    <div className="text-[10.5px] text-text-3">{c.warehouseName} · system {c.systemQty} vs counted {c.countedQty} {c.unit} · by {c.countedBy} on {c.countedISO}</div>
                  </div>
                  <span className="text-[12px] font-bold font-mono flex-none" style={{ color: toneVar(v.band) }}>{v.deltaQty >= 0 ? '+' : ''}{v.deltaQty} {c.unit}</span>
                  {canMutate && <button onClick={() => setReconcileFor(c)} className="text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium flex-none">Reconcile</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stock positions */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Stock by store</div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[640px]">
            <thead><tr>{['Material', 'Store', 'On hand', 'Available', 'Value', ''].map((h, i) => <th key={h || i} className={`text-[10px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.materialId}-${l.warehouseId}`} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5 border-b border-border"><div className="text-[12.5px] font-medium">{l.name}</div><div className="text-[10.5px] text-text-3 font-mono">{l.sku}</div></td>
                  <td className="px-4 py-2.5 border-b border-border text-[11.5px] text-text-3">{l.warehouseName}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[13px] font-mono font-semibold">{l.onHand}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">{l.onHand - l.reserved}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono">{naira(l.onHand * l.unitCostMinor)}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    {canMutate && (
                      <div className="inline-flex gap-1">
                        <button onClick={() => setDialog({ kind: 'transfer', line: l })} title="Transfer to another store" className="w-7 h-7 rounded-lg grid place-items-center border border-border-2"><ArrowLeftRight size={12} /></button>
                        <button onClick={() => setDialog({ kind: 'return', line: l })} title="Return from site" className="w-7 h-7 rounded-lg grid place-items-center border border-border-2"><Undo2 size={12} /></button>
                        <button onClick={() => setDialog({ kind: 'count', line: l })} title="Physical count" className="w-7 h-7 rounded-lg grid place-items-center border border-border-2"><ClipboardList size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Perpetual ledger */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Perpetual ledger <span className="text-[10.5px] text-text-3 font-normal">· every movement, with the running balance it produced</span></div>
        <div className="divide-y divide-border max-h-[340px] overflow-y-auto">
          {ledger.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center gap-2.5">
              <span className="text-[9.5px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(KIND_TONE[m.kind])} 14%, transparent)`, color: toneVar(KIND_TONE[m.kind]) }}>{STOCK_KIND_LABEL[m.kind]}</span>
              <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{m.materialName}</div><div className="text-[10.5px] text-text-3">{m.atISO.slice(0, 10)}{m.ref ? ` · ${m.ref}` : ''} · {m.by}</div></div>
              <span className="text-[12px] font-mono flex-none" style={{ color: toneVar(m.kind === 'receipt' || m.kind === 'return' ? 'success' : 'progress') }}>{m.kind === 'receipt' || m.kind === 'return' ? '+' : '−'}{m.qty}</span>
              <span className="text-[11px] font-mono text-text-3 flex-none w-16 text-right">= {m.runningQty} {m.unit}</span>
            </div>
          ))}
          {ledger.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No movements yet.</div>}
        </div>
      </section>

      {dialog?.kind === 'transfer' && <TransferDialog line={dialog.line} warehouses={warehouses} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); }} />}
      {dialog?.kind === 'return' && <ReturnDialog line={dialog.line} reasons={returnReasons} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); }} />}
      {dialog?.kind === 'count' && <CountDialog line={dialog.line} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); flash(m); }} />}
      {reconcileFor && <ReconcileDialog count={reconcileFor} reasons={adjustReasons} onClose={() => setReconcileFor(null)} onDone={(m) => { setReconcileFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade max-w-[92vw]">{toast}</div>}
    </div>
  );
}

function TransferDialog({ line, warehouses, onClose, onDone }: { line: StockLine; warehouses: WarehouseOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const others = warehouses.filter((w) => w.id !== line.warehouseId);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await transferStock(line.materialId, line.warehouseId, to, Number(qty)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Transferred · ${r.ref}`); }); }
  return (
    <Modal title="Transfer stock" onClose={onClose}>
      <Sub line={line} />
      <label className="lbls">To store</label>
      <select value={to} onChange={(e) => setTo(e.target.value)} className="inps">{others.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      <label className="lbls mt-2.5">Quantity</label>
      <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inps" autoFocus />
      <p className="text-[10.5px] text-text-3 mt-1.5">Blocked above {line.onHand} — a transfer can never drive the source store negative.</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={!qty || !to} label="Transfer" />
    </Modal>
  );
}

function ReturnDialog({ line, reasons, onClose, onDone }: { line: StockLine; reasons: ReasonOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState('1');
  const [codeId, setCodeId] = useState(reasons[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = reasons.find((r) => r.id === codeId);
  function submit() { setError(null); start(async () => { const r = await returnStock(line.materialId, line.warehouseId, Number(qty), codeId, note); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Returned · ${r.ref}`); }); }
  return (
    <Modal title="Return from site" onClose={onClose}>
      <Sub line={line} />
      <label className="lbls">Quantity returned</label>
      <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inps" autoFocus />
      <label className="lbls mt-2.5">Reason · required</label>
      <select value={codeId} onChange={(e) => setCodeId(e.target.value)} className="inps">{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      {code?.requiresNote && <><label className="lbls mt-2.5">Note · required</label><input value={note} onChange={(e) => setNote(e.target.value)} className="inps" /></>}
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={!qty || !codeId || (!!code?.requiresNote && !note.trim())} label="Return" />
    </Modal>
  );
}

function CountDialog({ line, onClose, onDone }: { line: StockLine; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState(String(line.onHand));
  const [error, setError] = useState<string | null>(null);
  const v = countVariance(line.onHand, Number(counted) || 0);
  function submit() { setError(null); start(async () => { const r = await recordStockCount(line.materialId, line.warehouseId, Number(counted)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Count recorded · ${r.ref}`); }); }
  return (
    <Modal title="Physical count" onClose={onClose}>
      <Sub line={line} />
      <label className="lbls">Counted quantity</label>
      <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inps" autoFocus />
      <div className="mt-2 text-[12px]" style={{ color: toneVar(v.band) }}>
        {v.direction === 'exact' ? 'Matches the system figure exactly.' : `${v.deltaQty > 0 ? '+' : ''}${v.deltaQty} ${line.unit} (${v.pct}% ${v.direction})`}
      </div>
      <p className="text-[10.5px] text-text-3 mt-1.5">Recording a count never moves stock on its own — you reconcile it with a coded reason afterwards.</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={counted === ''} label="Record count" />
    </Modal>
  );
}

function ReconcileDialog({ count, reasons, onClose, onDone }: { count: CountRow; reasons: ReasonOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [codeId, setCodeId] = useState(reasons[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = reasons.find((r) => r.id === codeId);
  const v = countVariance(count.systemQty, count.countedQty);
  function submit() { setError(null); start(async () => { const r = await reconcileStockCount(count.id, codeId, note); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Reconciled · ${r.ref}`); }); }
  return (
    <Modal title="Reconcile count" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]">
        <div className="font-semibold">{count.ref} · {count.materialName}</div>
        <div className="text-text-3">system {count.systemQty} → counted {count.countedQty} {count.unit}</div>
        <div className="mt-1 font-semibold" style={{ color: toneVar(v.band) }}>{v.deltaQty >= 0 ? '+' : ''}{v.deltaQty} {count.unit} will be written to stock</div>
      </div>
      <label className="lbls">Reason · required</label>
      <select value={codeId} onChange={(e) => setCodeId(e.target.value)} className="inps">{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      {code?.requiresNote && <><label className="lbls mt-2.5">Note · required</label><input value={note} onChange={(e) => setNote(e.target.value)} className="inps" autoFocus /></>}
      <p className="text-[10.5px] text-text-3 mt-1.5">The adjustment, its reason and the before/after figures all land in the audit trail.</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions pending={pending} onClose={onClose} onSubmit={submit} disabled={!codeId || (!!code?.requiresNote && !note.trim())} label="Reconcile" />
    </Modal>
  );
}

function Sub({ line }: { line: StockLine }) {
  return <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{line.name}</div><div className="text-text-3">{line.warehouseName} · {line.onHand} {line.unit} on hand</div></div>;
}
function Actions({ pending, onClose, onSubmit, disabled, label }: { pending: boolean; onClose: () => void; onSubmit: () => void; disabled: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
      <button onClick={onSubmit} disabled={pending || disabled} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Saving…' : label}</button>
    </div>
  );
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[350px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        {children}
        <style>{`.lbls{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inps{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inps:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
