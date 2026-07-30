'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Gavel, TriangleAlert, Check, Package, Star, ShieldAlert, X, Banknote } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';
import { approvePurchaseRequest, awardRfq, receiveDelivery } from '@/server/actions/construction';

export type RequestRow = { id: string; ref: string; item: string; qty: number; unit: string; costCode: string; estimateMinor: number; requiredISO: string; requestedBy: string; status: string; justification: string; exception: boolean; remainingMinor: number };
export type ScoredBid = { vendorId: string; vendorName: string; priceMinor: number; leadDays: number; warrantyMonths: number; compliancePct: number; score: number; priceScore: number; leadScore: number; warrantyScore: number; complianceScore: number; recommended: boolean; vendorBand: Tone; suspended: boolean };
export type RfqRow = { id: string; ref: string; item: string; qty: number; unit: string; status: string; bids: ScoredBid[]; awardedVendorId?: string };
export type OrderRow = { id: string; ref: string; item: string; vendorName: string; qty: number; deliveredQty: number; unit: string; valueMinor: number; status: string; expectedISO: string; late: boolean };

const naira = (m: number) => `₦${fmtM(m)}`;
const PR_TONE: Record<string, Tone> = { draft: 'muted', pending: 'warn', approved: 'success', rejected: 'danger', rfq: 'progress', ordered: 'info' };
const PO_TONE: Record<string, Tone> = { draft: 'muted', approved: 'info', issued: 'progress', acknowledged: 'progress', part_delivered: 'warn', delivered: 'success', closed: 'muted', cancelled: 'danger' };

export function ProcurementWorkspace({ requests, rfqs, orders, kpis, canMutate }: {
  requests: RequestRow[]; rfqs: RfqRow[]; orders: OrderRow[];
  kpis: { pending: number; openPoMinor: number; lateDeliveries: number; exceptions: number };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [receiveFor, setReceiveFor] = useState<OrderRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Awaiting approval" value={String(kpis.pending)} tone={kpis.pending ? 'warn' : 'success'} icon={<Gavel size={16} />} />
        <Kpi label="Open PO value" value={naira(kpis.openPoMinor)} tone="progress" icon={<Banknote size={16} />} />
        <Kpi label="Late deliveries" value={String(kpis.lateDeliveries)} tone={kpis.lateDeliveries ? 'danger' : 'success'} icon={<Truck size={16} />} />
        <Kpi label="Budget exceptions" value={String(kpis.exceptions)} tone={kpis.exceptions ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
      </div>

      {/* Bid intelligence — the crown */}
      {rfqs.map((rfq) => (
        <section key={rfq.id} className="bg-surface border rounded-2xl shadow-card overflow-hidden" style={{ borderColor: rfq.status === 'awarded' ? 'var(--border)' : 'color-mix(in srgb, var(--tone-progress) 35%, transparent)' }}>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('progress')} 14%, transparent)`, color: toneVar('progress') }}><Gavel size={16} /></span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">Bid comparison · {rfq.item}</div>
              <div className="text-[10.5px] text-text-3"><span className="font-mono">{rfq.ref}</span> · {rfq.qty} {rfq.unit} · {rfq.bids.length} quotes scored</div>
            </div>
            <span className="ml-auto text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(rfq.status === 'awarded' ? 'success' : 'progress')} 14%, transparent)`, color: toneVar(rfq.status === 'awarded' ? 'success' : 'progress') }}>{rfq.status}</span>
          </div>
          <div className="px-4 py-2 bg-surface-2 text-[10.5px] text-text-3">Weighted score — price 45% · lead time 20% · compliance 20% · warranty 15%. Advisory: a human awards.</div>
          <div className="divide-y divide-border">
            {rfq.bids.map((b) => (
              <div key={b.vendorId} className="px-4 py-3" style={b.recommended && rfq.status !== 'awarded' ? { background: 'color-mix(in srgb, var(--tone-success) 5%, transparent)' } : undefined}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold flex items-center gap-1.5 flex-wrap">
                      {b.vendorName}
                      {b.recommended && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full gap-1" style={{ background: `color-mix(in srgb, ${toneVar('success')} 15%, transparent)`, color: toneVar('success') }}><Star size={9} /> recommended</span>}
                      {rfq.awardedVendorId === b.vendorId && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('info')} 15%, transparent)`, color: toneVar('info') }}>awarded</span>}
                      {b.suspended && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full gap-1" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}><ShieldAlert size={9} /> suspended</span>}
                    </div>
                    <div className="text-[11px] text-text-3 mt-0.5">{naira(b.priceMinor)} · {b.leadDays}d lead · {b.compliancePct}% compliant{b.warrantyMonths ? ` · ${b.warrantyMonths}mo warranty` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    <div className="text-right"><div className="text-[19px] font-bold tracking-[-0.02em] leading-none" style={{ color: toneVar(b.score >= 75 ? 'success' : b.score >= 55 ? 'warn' : 'muted') }}>{b.score}</div><div className="text-[9px] text-text-3">score</div></div>
                    {canMutate && rfq.status !== 'awarded' && !b.suspended && <button disabled={pending} onClick={() => act(() => awardRfq(rfq.id, b.vendorId), 'Awarded — PO issued')} className="text-[11.5px] px-2.5 h-8 rounded-lg font-medium bg-primary text-white disabled:opacity-50">Award</button>}
                  </div>
                </div>
                {/* score breakdown */}
                <div className="grid grid-cols-4 gap-2 mt-2.5">
                  {[['Price', b.priceScore], ['Lead', b.leadScore], ['Compliance', b.complianceScore], ['Warranty', b.warrantyScore]].map(([label, v]) => (
                    <div key={label as string}>
                      <div className="flex justify-between text-[9.5px] text-text-3 mb-0.5"><span>{label}</span><span className="font-mono">{v as number}</span></div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v as number}%`, background: toneVar('progress') }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Requests */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold flex items-center gap-2"><Package size={14} className="text-text-3" /> Purchase requests</div>
        <div className="divide-y divide-border">
          {requests.map((r) => (
            <div key={r.id} className="px-4 py-3" style={r.exception ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                    {r.item}
                    {r.exception && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full gap-1" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}><TriangleAlert size={9} /> budget exception</span>}
                  </div>
                  <div className="text-[10.5px] text-text-3"><span className="font-mono">{r.ref}</span> · {r.qty} {r.unit} · {r.costCode} · needed {r.requiredISO} · {r.requestedBy}</div>
                  {r.exception && <div className="text-[10.5px] mt-1" style={{ color: toneVar('danger') }}>{naira(r.estimateMinor)} exceeds the {naira(r.remainingMinor)} left on {r.costCode} — routes to QS/executive for override or a budget revision.</div>}
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-[13px] font-semibold font-mono">{naira(r.estimateMinor)}</span>
                  <span className="text-[10px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PR_TONE[r.status] ?? 'muted')} 14%, transparent)`, color: toneVar(PR_TONE[r.status] ?? 'muted') }}>{r.status}</span>
                  {canMutate && (r.status === 'pending' || r.status === 'draft') && <button disabled={pending} onClick={() => act(() => approvePurchaseRequest(r.id), 'Request approved')} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Check size={12} /> Approve</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Orders */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold flex items-center gap-2"><Truck size={14} className="text-text-3" /> Purchase orders</div>
        <div className="divide-y divide-border">
          {orders.map((o) => (
            <div key={o.id} className="px-4 py-3 flex items-center gap-2.5" style={o.late ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">{o.item}{o.late && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}>late</span>}</div>
                <div className="text-[10.5px] text-text-3"><span className="font-mono">{o.ref}</span> · {o.vendorName} · due {o.expectedISO}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden max-w-[180px]"><div className="h-full rounded-full" style={{ width: `${(o.deliveredQty / Math.max(1, o.qty)) * 100}%`, background: toneVar(o.deliveredQty >= o.qty ? 'success' : o.late ? 'danger' : 'progress') }} /></div>
                  <span className="text-[10px] text-text-3">{o.deliveredQty}/{o.qty} {o.unit}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-none">
                <span className="text-[12.5px] font-semibold font-mono">{naira(o.valueMinor)}</span>
                <span className="text-[10px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PO_TONE[o.status] ?? 'muted')} 14%, transparent)`, color: toneVar(PO_TONE[o.status] ?? 'muted') }}>{o.status.replace('_', ' ')}</span>
                {canMutate && o.deliveredQty < o.qty && <button disabled={pending} onClick={() => setReceiveFor(o)} className="text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium disabled:opacity-50">Receive</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {receiveFor && <ReceiveDialog order={receiveFor} onClose={() => setReceiveFor(null)} onDone={(m) => { setReceiveFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function ReceiveDialog({ order, onClose, onDone }: { order: OrderRow; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const outstanding = order.qty - order.deliveredQty;
  const [qty, setQty] = useState(String(outstanding));
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await receiveDelivery(order.id, Number(qty)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Received ${r.ref} · stock and cost booked`); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Record goods receipt</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{order.item}</div><div className="text-text-3">{order.ref} · {order.vendorName} · {outstanding} {order.unit} outstanding</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Quantity received</label>
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" autoFocus />
        <p className="text-[10.5px] text-text-3 mt-1.5">Books stock into the site store and the pro-rata actual cost against {order.ref}&apos;s cost code — one movement, permanently recorded.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !qty} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Booking…' : 'Receive'}</button></div>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
