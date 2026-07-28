'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Store, Wallet, Package, ShoppingBag } from 'lucide-react';
import { formatMoney } from '@/components/domain';
import { toneVar, type Tone } from '@/lib/status-tones';
import { listingStats, perListing } from '@/domain/vendor-portal';
import { createListing, toggleListing } from '@/server/actions/vendor-listings';

export type ListingCard = { id: string; title: string; category: string; status: string; priceMinor: number; currency: string };
export type OrderLite = { listingTitle: string; amountMinor: number; status: string };

const money = (m: number, c = 'NGN') => formatMoney({ minor: m, currency: c } as Parameters<typeof formatMoney>[0]);
const CATEGORIES = ['HVAC', 'Plumbing', 'Electrical', 'Cleaning', 'Refrigeration', 'Security', 'General'];

export function VendorListingsWorkspace({ listings, orders }: { listings: ListingCard[]; orders: OrderLite[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const stats = listingStats(listings.map((l) => ({ id: l.id, status: l.status, priceMinor: l.priceMinor })), orders);
  const toggle = (id: string) => start(async () => { const r = await toggleListing(id); if (r.ok) { router.refresh(); flash('Listing updated'); } else flash(r.error); });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="Live" value={`${stats.live}`} note={`${stats.paused} paused`} tone="success" icon={<Package size={16} />} />
        <Kpi label="Orders" value={`${stats.orders}`} note="all-time" tone="info" icon={<ShoppingBag size={16} />} />
        <Kpi label="Revenue" value={money(stats.revenueMinor)} note="fulfilled" tone="progress" icon={<Wallet size={16} />} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">My services</h2>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105"><Plus size={16} /> New listing</button>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-2xl">
          <Store size={24} className="mx-auto text-text-3 mb-2" />
          <p className="text-[13px] font-medium">No listings yet</p>
          <p className="text-[12px] text-text-3 mt-0.5">List a service and residents can order it.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {listings.map((l) => {
            const perf = perListing(l.title, orders);
            const live = l.status === 'active';
            return (
              <div key={l.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{l.title}</div>
                    <div className="text-[11.5px] text-text-3">{l.category} · {perf.orders} order{perf.orders === 1 ? '' : 's'} · {money(perf.revenueMinor)} earned</div>
                  </div>
                  <span className="text-[15px] font-bold font-mono flex-none">{money(l.priceMinor, l.currency)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[11px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(live ? 'success' : 'neutral')} 14%, transparent)`, color: toneVar(live ? 'success' : 'neutral') }}>{live ? 'Active' : 'Paused'}</span>
                  <button onClick={() => toggle(l.id)} disabled={pending} className="ml-auto text-[12px] px-3 h-8 rounded-lg border border-border-2 text-text-2 disabled:opacity-50">{live ? 'Pause' : 'Activate'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); flash('Listing published'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await createListing({ title, category, priceNaira: Number(price) });
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">New listing</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <label className="text-[11px] font-semibold text-text-3 uppercase tracking-wide">Service</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="e.g. AC deep-clean & servicing" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13.5px] outline-none focus:border-primary mt-1 mb-3" />
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold text-text-3 uppercase tracking-wide">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mt-1">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-text-3 uppercase tracking-wide">Price (₦)</label>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="25000" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13.5px] outline-none focus:border-primary mt-1" />
          </div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
          <button onClick={submit} disabled={pending || !title.trim() || !price} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Publishing…' : 'Publish'}</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div>
      <div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[10.5px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
