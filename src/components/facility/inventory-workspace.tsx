'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package, AlertTriangle, Wallet, Clock, PackagePlus, X } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { stockSignal, type Part } from '@/domain/facility';
import { receiveStock } from '@/server/actions/facility';

export type PartRow = Part;

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

export function InventoryWorkspace({ parts, kpis }: { parts: PartRow[]; kpis: { total: number; belowReorder: number; stockValueMinor: number; stockoutsSoon: number } }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [receiveFor, setReceiveFor] = useState<PartRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const categories = ['all', ...Array.from(new Set(parts.map((p) => p.category)))];
  const shown = parts.filter((p) => (cat === 'all' || p.category === cat) && (!q.trim() || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Parts tracked" value={String(kpis.total)} tone="info" icon={<Package size={16} />} />
        <Kpi label="Below reorder" value={String(kpis.belowReorder)} tone={kpis.belowReorder ? 'danger' : 'success'} icon={<AlertTriangle size={16} />} />
        <Kpi label="Stock-out ≤7d" value={String(kpis.stockoutsSoon)} tone={kpis.stockoutsSoon ? 'warn' : 'success'} icon={<Clock size={16} />} />
        <Kpi label="Stock value" value={money(kpis.stockValueMinor)} tone="progress" icon={<Wallet size={16} />} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border-2 bg-surface flex-1 min-w-[160px]"><Search size={15} className="text-text-3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts…" className="flex-1 bg-transparent outline-none text-[13px]" aria-label="Search parts" /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 px-2 rounded-xl border border-border-2 bg-surface text-[12.5px] capitalize">{categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}</select>
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[640px]">
            <thead><tr>{['Part', 'Location', 'Stock', 'Forecast', 'Used/mo', ''].map((h, i) => <th key={h || i} className={`text-[10px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((p) => {
                const s = stockSignal(p);
                return (
                  <tr key={p.id} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5 border-b border-border"><div className="text-[13px] font-medium">{p.name}</div><div className="text-[11px] text-text-3 font-mono">{p.sku} · {p.category}</div></td>
                    <td className="px-4 py-2.5 border-b border-border text-[12px] text-text-3">{p.location}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right"><span className="text-[13px] font-mono font-semibold" style={{ color: s.belowReorder ? toneVar('danger') : undefined }}>{p.stock}</span><span className="text-[10px] text-text-3"> /{p.reorderPoint}</span></td>
                    <td className="px-4 py-2.5 border-b border-border text-right"><span className="text-[11px] font-semibold px-2 h-5 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(s.band)} 14%, transparent)`, color: toneVar(s.band) }}>{s.belowReorder ? 'reorder now' : s.daysToStockout !== null ? `${s.daysToStockout}d left` : 'ample'}</span></td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">{p.usedPerMonth}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right"><button onClick={() => setReceiveFor(p)} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1"><PackagePlus size={12} /> Receive</button></td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-text-3">No parts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {receiveFor && <ReceiveDialog part={receiveFor} onClose={() => setReceiveFor(null)} onDone={() => { setReceiveFor(null); flash('Stock received'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function ReceiveDialog({ part, onClose, onDone }: { part: PartRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const s = stockSignal(part);
  const suggested = Math.max(part.reorderPoint * 2 - part.stock, part.usedPerMonth);
  const [qty, setQty] = useState(String(suggested));
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await receiveStock(part.id, Number(qty)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Receive stock</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{part.name}</div><div className="text-text-3">In stock {part.stock} · reorder at {part.reorderPoint}{s.belowReorder ? ' · below reorder' : ''}</div></div>
        <label className="lbli">Quantity received</label><input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpi" autoFocus />
        <p className="text-[10.5px] text-text-3 mt-1.5">Suggested {suggested} — to cover ~a month at current usage.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !qty} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Receive'}</button></div>
        <style>{`.lbli{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpi{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpi:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
