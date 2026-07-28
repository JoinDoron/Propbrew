'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, X, Check, AlertTriangle, Camera, FileDown, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { saveInspection } from '@/server/actions/shortlet';

export type PendingRow = { id: string; ref: string; guest: string; apt: string; property: string; cautionFeeMinor: number };
export type DoneRow = { bookingId: string; ref: string; guest: string; apt: string; at: string; outcome: string; damageMinor: number; cautionFeeMinor: number; cautionStatus: string; items: { label: string; condition: string; note?: string; chargeMinor?: number }[] };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;
const DEFAULT_ITEMS = ['Living room', 'Kitchen & appliances', 'Bathroom(s)', 'Bedroom(s)', 'Inventory (towels, remotes)', 'Keys & access cards'];
const CAUTION_TONE: Record<string, Tone> = { refunded: 'success', partly_deducted: 'warn', forfeited: 'danger', held: 'info', pending: 'neutral' };

export function InspectionsWorkspace({ pending: pendingRows, done }: { pending: PendingRow[]; done: DoneRow[] }) {
  const [runFor, setRunFor] = useState<PendingRow | null>(null);
  const [packFor, setPackFor] = useState<DoneRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-3">
        Checkout inspections drive the caution-fee decision (FR-CI-03) and are stored permanently as dispute evidence (NFR-04). {pendingRows.length} awaiting inspection.
      </div>

      {pendingRows.length > 0 && (
        <div>
          <h2 className="text-[13.5px] font-semibold mb-2">Awaiting inspection</h2>
          <div className="flex flex-col gap-2">
            {pendingRows.map((p) => (
              <div key={p.id} className="bg-surface border border-[color:var(--tone-warn)]/35 rounded-2xl shadow-card p-4 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 14%, transparent)`, color: toneVar('warn') }}><AlertTriangle size={17} /></span>
                <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold truncate">{p.apt} · {p.guest}</div><div className="text-[11.5px] text-text-3">{p.ref} · caution {money(p.cautionFeeMinor)} held</div></div>
                <button onClick={() => setRunFor(p)} className="h-9 px-3.5 rounded-xl bg-primary text-white text-[12.5px] font-medium inline-flex items-center gap-1.5"><ShieldCheck size={15} /> Run inspection</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[13.5px] font-semibold mb-2">Completed</h2>
        {done.length === 0 ? <p className="text-[12.5px] text-text-3">No inspections yet.</p> : (
          <div className="flex flex-col gap-2">
            {done.map((d) => (
              <div key={d.bookingId} className="bg-surface border border-border rounded-2xl shadow-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-[13.5px] font-semibold truncate">{d.apt} · {d.guest}</div><div className="text-[11.5px] text-text-3">{d.ref} · {d.at.slice(0, 10)} · {d.items.filter((i) => i.condition !== 'ok').length} issue(s)</div></div>
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize flex-none" style={{ background: `color-mix(in srgb, ${toneVar(CAUTION_TONE[d.cautionStatus] ?? 'neutral')} 14%, transparent)`, color: toneVar(CAUTION_TONE[d.cautionStatus] ?? 'neutral') }}>{d.cautionStatus.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-3 mt-2.5 text-[12px]">
                  <span>Caution {money(d.cautionFeeMinor)}</span>
                  <span className="text-text-3">→</span>
                  <span className={d.damageMinor > 0 ? 'text-warning font-medium' : 'text-positive font-medium'}>{d.damageMinor > 0 ? `${money(d.damageMinor)} deducted` : 'Refunded in full'}</span>
                  <button onClick={() => setPackFor(d)} className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-1"><FileDown size={12} /> Dispute pack</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {runFor && <RunDialog booking={runFor} onClose={() => setRunFor(null)} onDone={(msg) => { setRunFor(null); flash(msg); }} />}
      {packFor && <PackModal d={packFor} onClose={() => setPackFor(null)} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function RunDialog({ booking, onClose, onDone }: { booking: PendingRow; onClose: () => void; onDone: (msg: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(DEFAULT_ITEMS.map((label) => ({ label, condition: 'ok' as 'ok' | 'damaged' | 'missing', charge: '', note: '' })));
  const [error, setError] = useState<string | null>(null);
  const damage = items.reduce((n, it) => n + (it.condition !== 'ok' ? Number(it.charge || 0) * 100 : 0), 0);
  const decision = damage <= 0 ? 'Refund in full' : damage >= booking.cautionFeeMinor ? 'Forfeit caution' : `Deduct ${money(damage)}, refund ${money(booking.cautionFeeMinor - damage)}`;

  function set(i: number, patch: Partial<(typeof items)[number]>) { setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it))); }
  function submit() {
    setError(null);
    start(async () => {
      const payload = items.map((it) => ({ label: it.label, condition: it.condition, note: it.note || undefined, photo: it.condition !== 'ok', chargeMinor: it.condition !== 'ok' ? Number(it.charge || 0) * 100 : undefined }));
      const r = await saveInspection(booking.id, payload, 'Operator');
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(damage > 0 ? `Inspection saved — ${money(damage)} deducted, booking closed.` : 'Inspection clear — caution refunded, booking closed.');
    });
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1"><h3 className="text-[15px] font-semibold">Checkout inspection</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <p className="text-[11.5px] text-text-3 mb-3">{booking.apt} · {booking.guest} · caution {money(booking.cautionFeeMinor)} held</p>
        <div className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <div key={it.label} className="rounded-xl border border-border p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium flex-1">{it.label}</span>
                <div className="inline-flex rounded-lg border border-border-2 overflow-hidden">
                  {(['ok', 'damaged', 'missing'] as const).map((c) => (
                    <button key={c} onClick={() => set(i, { condition: c })} className={`text-[10.5px] px-2 h-6 capitalize ${it.condition === c ? (c === 'ok' ? 'bg-success text-white' : c === 'damaged' ? 'bg-[color:var(--tone-warn)] text-white' : 'bg-[color:var(--tone-danger)] text-white') : 'text-text-3'}`}>{c}</button>
                  ))}
                </div>
              </div>
              {it.condition !== 'ok' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-text-3 inline-flex items-center gap-0.5"><Camera size={11} /> photo</span>
                  <input value={it.note} onChange={(e) => set(i, { note: e.target.value })} placeholder="What's wrong?" className="flex-1 h-7 px-2 rounded-lg border border-border-2 bg-surface text-[11.5px] outline-none" />
                  <input value={it.charge} onChange={(e) => set(i, { charge: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="₦ charge" className="w-20 h-7 px-2 rounded-lg border border-border-2 bg-surface text-[11.5px] outline-none" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl p-3 flex items-center gap-2" style={{ background: `color-mix(in srgb, ${toneVar(damage > 0 ? 'warn' : 'success')} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(damage > 0 ? 'warn' : 'success')} 30%, transparent)` }}>
          <Sparkles size={14} style={{ color: toneVar(damage > 0 ? 'warn' : 'success') }} />
          <div className="text-[12px]"><span className="font-semibold">Caution decision:</span> {decision}</div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-3.5"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Save & close booking'}</button></div>
      </div>
    </div>
  );
}

function PackModal({ d, onClose }: { d: DoneRow; onClose: () => void }) {
  function download() {
    const lines = [`VESTA SHORT-LET — CHECKOUT INSPECTION / DISPUTE EVIDENCE`, ``, `Booking: ${d.ref}`, `Guest: ${d.guest}`, `Apartment: ${d.apt}`, `Inspected: ${d.at}`, ``, `ITEMS:`, ...d.items.map((i) => `  • ${i.label}: ${i.condition.toUpperCase()}${i.note ? ` — ${i.note}` : ''}${i.chargeMinor ? ` (${money(i.chargeMinor)})` : ''}${i.condition !== 'ok' ? ' [photo on file]' : ''}`), ``, `Caution held: ${money(d.cautionFeeMinor)}`, `Deducted: ${money(d.damageMinor)}`, `Outcome: ${d.cautionStatus.replace('_', ' ')}`].join('\n');
    const url = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `dispute-pack-${d.ref}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Dispute evidence pack</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="text-[12px] text-text-3 mb-2">{d.apt} · {d.guest} · {d.ref}</div>
        <div className="flex flex-col gap-1">
          {d.items.map((i) => (
            <div key={i.label} className="flex items-center gap-2 py-1 text-[12px]">
              {i.condition === 'ok' ? <Check size={13} className="text-positive flex-none" /> : <AlertTriangle size={13} className="text-warning flex-none" />}
              <span className="flex-1">{i.label}{i.note ? ` — ${i.note}` : ''}</span>
              {i.condition !== 'ok' && <span className="text-[10px] text-text-3 inline-flex items-center gap-0.5"><Camera size={10} /> photo</span>}
              {i.chargeMinor ? <span className="font-mono text-[11px]">{money(i.chargeMinor)}</span> : null}
            </div>
          ))}
        </div>
        <button onClick={download} className="mt-3 w-full h-9 rounded-lg bg-primary text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5"><FileDown size={15} /> Download evidence pack</button>
      </div>
    </div>
  );
}
