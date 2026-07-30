'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, TriangleAlert, ArrowDownUp, Search, X, Fuel, Boxes, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';
import { issueMaterials } from '@/server/actions/construction';

export type MaterialRow = {
  id: string; sku: string; name: string; category: string; unit: string; onHand: number; reserved: number; inTransit: number;
  reorderLevel: number; unitCostMinor: number; belowReorder: boolean; daysCover: number | null; band: Tone;
  receivedQty: number; issuedQty: number; leakageQty: number; leakagePct: number; anomalous: boolean; leakageValueMinor: number;
};
export type TrailNodeRow = { id: string; label: string; minor: number; tone: Tone };
export type MovementRow = { id: string; materialName: string; kind: string; qty: number; unit: string; atISO: string; ref?: string; by: string };

const naira = (m: number) => `₦${fmtM(m)}`;
const KIND_TONE: Record<string, Tone> = { receipt: 'success', issue: 'progress', transfer: 'info', return: 'warn', adjust: 'danger' };

export function MaterialsWorkspace({ materials, trail, movements, projectName, kpis, canMutate, projectId }: {
  materials: MaterialRow[]; trail: TrailNodeRow[]; movements: MovementRow[]; projectName: string;
  kpis: { stockValueMinor: number; belowReorder: number; leakageValueMinor: number; anomalies: number };
  canMutate: boolean; projectId: string;
}) {
  const [q, setQ] = useState('');
  const [issueFor, setIssueFor] = useState<MaterialRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const shown = materials.filter((m) => !q.trim() || `${m.name} ${m.sku}`.toLowerCase().includes(q.toLowerCase()));
  const maxTrail = Math.max(1, ...trail.map((t) => t.minor));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Stock value" value={naira(kpis.stockValueMinor)} tone="info" icon={<Boxes size={16} />} />
        <Kpi label="Below reorder" value={String(kpis.belowReorder)} tone={kpis.belowReorder ? 'danger' : 'success'} icon={<Package size={16} />} />
        <Kpi label="Unaccounted value" value={naira(kpis.leakageValueMinor)} tone={kpis.leakageValueMinor > 0 ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
        <Kpi label="Leakage flags" value={String(kpis.anomalies)} tone={kpis.anomalies ? 'danger' : 'success'} icon={<Fuel size={16} />} />
      </div>

      {/* Money trail */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="text-[12.5px] font-semibold mb-1">Money trail · {projectName}</div>
        <p className="text-[10.5px] text-text-3 mb-3">Where the budget actually goes — approved → committed → ordered → received → booked as cost. Each bar is real kobo from your records.</p>
        <div className="flex flex-col gap-2.5">
          {trail.map((t, i) => (
            <div key={t.id}>
              <div className="flex justify-between text-[11px] mb-1"><span className="text-text-2 font-medium">{t.label}</span><span className="font-mono text-text-3">{naira(t.minor)}</span></div>
              <div className="h-6 rounded-lg bg-surface-2 overflow-hidden relative">
                <div className="h-full rounded-lg transition-all" style={{ width: `${(t.minor / maxTrail) * 100}%`, background: `color-mix(in srgb, ${toneVar(t.tone)} 65%, transparent)` }} />
                {i > 0 && trail[i - 1].minor > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-3">{Math.round((t.minor / trail[i - 1].minor) * 100)}% of {trail[i - 1].label.toLowerCase()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Leakage */}
      {materials.some((m) => m.anomalous) && (
        <section className="rounded-2xl border p-4" style={{ borderColor: 'color-mix(in srgb, var(--tone-danger) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' }}>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold mb-1" style={{ color: toneVar('danger') }}><TriangleAlert size={14} /> Leakage detected — advisory</div>
          <p className="text-[11px] text-text-3 mb-3">Received minus issued minus counted stock leaves a gap. This is a prompt to run a stock count and record a reason — <span className="font-medium">not an accusation</span>.</p>
          <div className="flex flex-col gap-2">
            {materials.filter((m) => m.anomalous).map((m) => (
              <div key={m.id} className="bg-surface rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[13px] font-semibold">{m.name}</div>
                  <div className="text-[13px] font-bold" style={{ color: toneVar('danger') }}>{m.leakageQty} {m.unit} · {naira(m.leakageValueMinor)}</div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px]">
                  <Segment label={`received ${m.receivedQty}`} width={100} tone="success" />
                  <Segment label={`issued ${m.issuedQty}`} width={Math.round((m.issuedQty / Math.max(1, m.receivedQty)) * 100)} tone="progress" />
                  <Segment label={`on hand ${m.onHand}`} width={Math.round((m.onHand / Math.max(1, m.receivedQty)) * 100)} tone="info" />
                  <Segment label={`gap ${m.leakagePct}%`} width={Math.max(8, m.leakagePct)} tone="danger" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stock */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span className="text-[12.5px] font-semibold">Stock on hand</span>
          <div className="ml-auto flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border-2"><Search size={13} className="text-text-3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="bg-transparent outline-none text-[12px] w-28" aria-label="Search materials" /></div>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[620px]">
            <thead><tr>{['Material', 'On hand', 'Available', 'In transit', 'Cover', ''].map((h, i) => <th key={h || i} className={`text-[10px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border ${i === 0 ? 'text-left' : i === 5 ? 'text-right' : 'text-right'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5 border-b border-border"><div className="text-[12.5px] font-medium">{m.name}</div><div className="text-[10.5px] text-text-3 font-mono">{m.sku} · {m.category}</div></td>
                  <td className="px-4 py-2.5 border-b border-border text-right"><span className="text-[13px] font-mono font-semibold" style={{ color: m.belowReorder ? toneVar('danger') : undefined }}>{m.onHand}</span><span className="text-[10px] text-text-3"> /{m.reorderLevel}</span></td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">{m.onHand - m.reserved}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">{m.inTransit || '—'}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right"><span className="text-[11px] font-semibold px-2 h-5 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(m.band)} 14%, transparent)`, color: toneVar(m.band) }}>{m.belowReorder ? 'reorder' : m.daysCover !== null ? `${m.daysCover}d` : 'ample'}</span></td>
                  <td className="px-4 py-2.5 border-b border-border text-right">{canMutate && m.onHand > 0 && <button onClick={() => setIssueFor(m)} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2 inline-flex items-center gap-1"><ArrowDownUp size={11} /> Issue</button>}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-text-3">No materials match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Movements */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Movement history <span className="text-[10.5px] text-text-3 font-normal">· every receipt and issue, permanently recorded</span></div>
        <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
          {movements.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center gap-2.5">
              <span className="text-[9.5px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(KIND_TONE[m.kind] ?? 'muted')} 14%, transparent)`, color: toneVar(KIND_TONE[m.kind] ?? 'muted') }}>{m.kind}</span>
              <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{m.materialName}</div><div className="text-[10.5px] text-text-3">{m.atISO}{m.ref ? ` · ${m.ref}` : ''} · {m.by}</div></div>
              <span className="text-[12px] font-mono font-semibold flex-none" style={{ color: toneVar(m.kind === 'receipt' ? 'success' : 'progress') }}>{m.kind === 'receipt' ? '+' : '−'}{m.qty} {m.unit}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="text-[11px] text-text-3 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-none" /> Leakage is a variance signal computed from your own movement records — investigate with a stock count before drawing conclusions.</div>

      {issueFor && <IssueDialog material={issueFor} projectId={projectId} onClose={() => setIssueFor(null)} onDone={(m) => { setIssueFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function IssueDialog({ material, projectId, onClose, onDone }: { material: MaterialRow; projectId: string; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await issueMaterials(material.id, Number(qty), projectId); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Issued ${qty} ${material.unit} of ${material.name}`); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Issue to site</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{material.name}</div><div className="text-text-3">{material.onHand} {material.unit} on hand · {material.onHand - material.reserved} available</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Quantity</label>
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" autoFocus />
        <p className="text-[10.5px] text-text-3 mt-1.5">Issuing more than on-hand is blocked — stock can never go negative.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !qty} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Issuing…' : 'Issue'}</button></div>
      </div>
    </div>
  );
}
function Segment({ label, width, tone }: { label: string; width: number; tone: Tone }) {
  return <div className="flex-none" style={{ width: `${Math.max(6, Math.min(100, width))}%` }}><div className="h-1.5 rounded-full" style={{ background: toneVar(tone) }} /><div className="text-text-3 mt-0.5 truncate">{label}</div></div>;
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
