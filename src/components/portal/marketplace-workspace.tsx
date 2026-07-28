'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Check, Clock, RotateCcw, ShoppingBag, Store } from 'lucide-react';
import { formatMoney, DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import type { OrderStatus } from '@/domain/enums';
import { orderStepIndex, ORDER_STEPS } from '@/domain/resident-portal';
import { placeOrder } from '@/server/actions/resident-orders';

export type ListingCard = { id: string; title: string; vendorName: string; category: string; priceMinor: number; currency: string };
export type OrderCard = { id: string; ref: string; listingTitle: string; status: OrderStatus; amountMinor: number; currency: string };

const money = (m: number, c = 'NGN') => formatMoney({ minor: m, currency: c } as Parameters<typeof formatMoney>[0]);

export function MarketplaceWorkspace({ listings, orders }: { listings: ListingCard[]; orders: OrderCard[] }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<ListingCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const categories = useMemo(() => ['all', ...Array.from(new Set(listings.map((l) => l.category)))], [listings]);
  const shown = useMemo(() => listings.filter((l) => (cat === 'all' || l.category === cat) && (!q.trim() || `${l.title} ${l.vendorName}`.toLowerCase().includes(q.toLowerCase()))), [listings, cat, q]);

  return (
    <div className="flex flex-col gap-4">
      {/* Discover */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border-2 bg-surface">
          <Search size={15} className="text-text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="flex-1 bg-transparent outline-none text-[13px]" aria-label="Search services" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`flex-none h-7 px-3 rounded-full text-[12px] font-medium capitalize border transition-colors ${cat === c ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2.5">
        {shown.map((l) => (
          <div key={l.id} className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold truncate">{l.title}</h3>
                <p className="text-[11.5px] text-text-3 mt-0.5 flex items-center gap-1"><Store size={11} /> {l.vendorName} · {l.category}</p>
              </div>
              <span className="text-[15px] font-bold font-mono flex-none">{money(l.priceMinor, l.currency)}</span>
            </div>
            <button onClick={() => setConfirm(l)} className="mt-3 h-9 rounded-xl bg-primary text-white text-[12.5px] font-medium hover:brightness-105 inline-flex items-center justify-center gap-1.5"><ShoppingBag size={14} /> Order now</button>
          </div>
        ))}
        {shown.length === 0 && <p className="text-[12.5px] text-text-3 col-span-full text-center py-8">No services match.</p>}
      </div>

      {/* My orders */}
      <div>
        <h2 className="text-[14px] font-semibold mb-2.5">My orders</h2>
        {orders.length === 0 ? (
          <p className="text-[12.5px] text-text-3">You haven’t ordered anything yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {orders.map((o) => {
              const step = orderStepIndex(o.status);
              const reorder = listings.find((l) => l.title === o.listingTitle);
              return (
                <div key={o.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-[13.5px] font-semibold truncate">{o.listingTitle}</div><div className="text-[11px] text-text-3 font-mono">{o.ref} · {money(o.amountMinor, o.currency)}</div></div>
                    <DomainStatus type="order" status={o.status} />
                  </div>
                  {step >= 0 ? <OrderTracker step={step} /> : <p className="text-[12px] text-negative mt-2.5">Order {o.status}.</p>}
                  {reorder && step < 0 && <button onClick={() => setConfirm(reorder)} className="mt-2.5 text-[11.5px] text-primary hover:underline inline-flex items-center gap-1"><RotateCcw size={12} /> Order again</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirm && <ConfirmDialog listing={confirm} onClose={() => setConfirm(null)} onDone={(ref) => { setConfirm(null); flash(`Order ${ref} placed — the vendor will confirm shortly.`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function OrderTracker({ step }: { step: number }) {
  return (
    <div className="flex items-center mt-3">
      {ORDER_STEPS.map((label, i) => {
        const done = i < step, current = i === step;
        return (
          <div key={label} className="flex-1 flex items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`w-4.5 h-4.5 rounded-full grid place-items-center flex-none ${done ? 'bg-success text-white' : current ? 'bg-primary text-white' : 'bg-surface-3 text-text-3'}`} style={{ width: 18, height: 18 }}>
                {done ? <Check size={10} /> : current ? <Clock size={10} /> : <span className="w-1 h-1 rounded-full bg-current" />}
              </span>
              <span className={`text-[9px] ${current ? 'text-primary font-semibold' : 'text-text-3'}`}>{label}</span>
            </div>
            {i < ORDER_STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: i < step ? toneVar('success') : 'var(--surface-3)' }} />}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog({ listing, onClose, onDone }: { listing: ListingCard; onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit() {
    setError(null);
    start(async () => {
      const r = await placeOrder(listing.id);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(r.ref);
    });
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[400px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Confirm order</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-[14px] font-semibold">{listing.title}</div>
          <div className="text-[12px] text-text-3 mt-0.5">{listing.vendorName} · {listing.category}</div>
          <div className="text-[20px] font-bold font-mono mt-2">{money(listing.priceMinor, listing.currency)}</div>
        </div>
        <p className="text-[11.5px] text-text-3 mt-2.5">Payment is held and released to the vendor on fulfilment (SC-02). You can track progress here.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-3.5">
          <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
          <button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Placing…' : 'Place order'}</button>
        </div>
      </div>
    </div>
  );
}
