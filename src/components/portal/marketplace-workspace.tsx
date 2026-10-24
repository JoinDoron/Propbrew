'use client';

import { PortalCard, portalMoney } from './portal-patterns';
import layout from '@/components/ui/workspace-layout.module.css';

import { PortalDialog } from '@/components/portal/portal-dialog';
import { PageTabs } from '@/components/ui/page-tabs';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Check, Clock, RotateCcw, ShoppingBag, Store } from 'lucide-react';
import { DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import type { OrderStatus } from '@/domain/enums';
import { orderStepIndex, ORDER_STEPS } from '@/domain/resident-portal';
import { placeOrder } from '@/server/actions/resident-orders';
import styles from './portal-workspaces.module.css';

export type ListingCard = { id: string; title: string; vendorName: string; vendorOrgId?: string; category: string; priceMinor: number; currency: string };
export type OrderCard = { id: string; ref: string; listingTitle: string; vendorOrgId?: string; status: OrderStatus; amountMinor: number; currency: string };

/** Older orders lack listing IDs. Reorder only when the recorded vendor/title/currency identify exactly one active service. */
export function reorderListing(order: OrderCard, listings: ListingCard[]) {
  if (!order.vendorOrgId) return undefined;
  const matches = listings.filter((listing) => listing.title === order.listingTitle && listing.vendorOrgId === order.vendorOrgId && listing.currency === order.currency);
  return matches.length === 1 ? matches[0] : undefined;
}

const money = portalMoney;

export function MarketplaceWorkspace({ listings, orders, canOrder = false }: { listings: ListingCard[]; orders: OrderCard[]; canOrder?: boolean }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<ListingCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const categories = useMemo(() => ['all', ...Array.from(new Set(listings.map((l) => l.category)))], [listings]);
  const shown = useMemo(() => listings.filter((l) => (cat === 'all' || l.category === cat) && (!q.trim() || `${l.title} ${l.vendorName}`.toLowerCase().includes(q.toLowerCase()))), [listings, cat, q]);

  return (
    <div className={layout.layout}>

      <PageTabs label="Marketplace sections" items={[
        {
          id: "discover", label: "Discover services", content: <div className={layout.layout}>
            <div className="flex flex-col gap-6 min-w-0">
              <div className="pb-search">
                <Search size={15} className="text-text-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="flex-1 bg-transparent outline-none text-[14px]" aria-label="Search services" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {categories.map((c) => (
                  <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`pb-filter flex-none h-7 px-3 rounded-full text-[12px] font-medium capitalize border transition-colors ${cat === c ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2.5">
              {shown.map((l) => (
                <PortalCard padded={false} key={l.id} className="p-6 min-w-0 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-medium truncate">{l.title}</h3>
                      <p className="text-[12px] text-text-3 mt-0.5 flex items-center gap-1"><Store size={11} /> {l.vendorName} · {l.category}</p>
                    </div>
                    <span className="text-[15px] font-bold font-mono flex-none">{money(l.priceMinor, l.currency)}</span>
                  </div>
                  <button disabled={!canOrder} onClick={() => setConfirm(l)} className="pb-action mt-3 h-9 rounded-xl bg-primary text-white text-[14px] font-medium hover:brightness-105 inline-flex items-center justify-center gap-1.5"><ShoppingBag size={14} /> Order now</button>
                </PortalCard>
              ))}
              {shown.length === 0 && <p className="text-[14px] text-text-3 col-span-full text-center py-8">No services match.</p>}
            </div>
          </div>
        },
        {
          id: "orders", label: "My orders", content: <div className={layout.layout}>
            <div>
              <h2 className="text-[14px] font-semibold mb-2.5">My orders</h2>
              {orders.length === 0 ? (
                <p className="text-[14px] text-text-3">You haven’t ordered anything yet.</p>
              ) : (
                <div className="flex flex-col gap-6 min-w-0">
                  {orders.map((o) => {
                    const step = orderStepIndex(o.status);
                    const reorder = reorderListing(o, listings);
                    return (
                      <PortalCard padded={false} key={o.id} className="p-6 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><div className="text-[14px] font-medium truncate">{o.listingTitle}</div><div className="text-[12px] text-text-3 font-mono">{o.ref} · {money(o.amountMinor, o.currency)}</div></div>
                          <DomainStatus type="order" status={o.status} />
                        </div>
                        {step >= 0 ? <OrderTracker step={step} /> : <p className="text-[12px] text-negative mt-2.5">Order {o.status}.</p>}
                        {canOrder && reorder && step < 0 && <button onClick={() => setConfirm(reorder)} className="pb-action mt-2.5 text-[12px] text-primary hover:underline inline-flex items-center gap-1"><RotateCcw size={12} /> Order again</button>}
                      </PortalCard>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        }
      ]} />

      {confirm && canOrder && <ConfirmDialog listing={confirm} onClose={() => setConfirm(null)} onDone={(ref) => { setConfirm(null); flash(`Order ${ref} recorded. Vendor acceptance and payment are not yet confirmed.`); }} />}

      {toast && <div role="status" className={layout.toast}><span>{toast}</span><button type="button" className="pb-icon-action" aria-label="Dismiss order message" onClick={() => setToast(null)}><X size={16} /></button></div>}

    </div>
  );
}

function OrderTracker({ step }: { step: number }) {
  return (
    <div className={styles.scroll} role="region" tabIndex={0} aria-label="Order progress"><div className={styles.progress}>
      {ORDER_STEPS.map((label, i) => {
        const done = i < step, current = i === step;
        return (
          <div key={label} className="flex-1 flex items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full grid place-items-center flex-none" style={{ width: 20, height: 20, background: done ? toneVar('success') : current ? 'var(--primary)' : 'var(--surface-3)', color: done || current ? 'var(--on-primary)' : 'var(--text-3)' }} aria-hidden="true">
                {done ? <Check size={10} /> : current ? <Clock size={10} /> : <span className="w-1 h-1 rounded-full bg-current" />}
              </span>
              <span className={`text-[12px] ${current ? 'text-primary font-medium' : 'text-text-3'}`} aria-current={current ? 'step' : undefined}>{label}</span>
            </div>
            {i < ORDER_STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: i < step ? toneVar('success') : 'var(--surface-3)' }} />}
          </div>
        );
      })}
    </div></div>
  );
}

function ConfirmDialog({ listing, onClose, onDone }: { listing: ListingCard; onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  function submit() {
    if (pending || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
      const r = await placeOrder(listing.id);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(r.ref);
      } catch { setError('We could not confirm the order. Refresh and check your orders before retrying to avoid a duplicate.'); }
      finally { inFlight.current = false; }
    });
  }
  return (
    <PortalDialog label="Confirm order" onClose={onClose} width={540} canClose={!pending}>

      <PortalCard padded={false} className="relative w-full p-6">
        <div className="flex items-center justify-between mb-3"><h3 className="pb-dialog-title text-[15px] font-semibold">Confirm order</h3><button aria-label="Close order review" disabled={pending} onClick={onClose} className="pb-icon-action rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-[14px] font-semibold">{listing.title}</div>
          <div className="text-[12px] text-text-3 mt-0.5">{listing.vendorName} · {listing.category}</div>
          <div className="text-[20px] font-bold font-mono mt-2">{money(listing.priceMinor, listing.currency)}</div>
        </div>
        <p className="text-[14px] text-text-3 mt-2.5">This records an order request. It does not hold funds, debit your bank account or guarantee a vendor payout. Payment and settlement require separate verification.</p>
        {error && <div role="alert" className="text-[14px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-3.5">
          <button disabled={pending} onClick={onClose} className="pb-action h-9 px-3.5 rounded-lg border border-border-2 text-[14px]">Cancel</button>
          <button onClick={submit} disabled={pending} className="pb-action h-9 px-4 rounded-lg bg-primary text-white text-[14px] font-medium disabled:opacity-50">{pending ? 'Placing…' : 'Place order'}</button>
        </div>
      </PortalCard>
    </PortalDialog>
  );
}
