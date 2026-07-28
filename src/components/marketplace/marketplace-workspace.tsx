'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, TrendingUp, ShieldAlert, Store, CheckCircle2, Package } from 'lucide-react';
import { formatMoney } from '@/components/domain';
import { toneVar, humanizeStatus, type Tone } from '@/lib/status-tones';
import { transition } from '@/server/actions/transitions';
import type { InlineEvent } from '@/components/inline-actions';
import type { Listing } from '@/domain/entities';
import type { OrderStatus } from '@/domain/enums';
import { PIPELINE, type Gmv, type VendorScore, type FraudFlag } from '@/domain/marketplace';

export type OrderView = { id: string; ref: string; residentName: string; listingTitle: string; vendorName: string; status: OrderStatus; amountMinor: number; currency: string; actions: InlineEvent[] };

const COL_LABEL: Record<string, string> = { placed: 'Placed', accepted: 'Accepted', fulfilled: 'Fulfilled', closed: 'Closed' };

export function MarketplaceWorkspace({ orders, listings, gmv, vendors, flags, canMutate }: {
  orders: OrderView[]; listings: readonly Listing[]; gmv: Gmv; vendors: VendorScore[]; flags: FraudFlag[]; canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [openVendor, setOpenVendor] = useState<string | null>(null);

  const money = (minor: number, ccy = 'NGN') => formatMoney({ minor, currency: ccy } as Parameters<typeof formatMoney>[0]);
  const fire = (id: string, event: string) => start(async () => { await transition('marketplace-order', id, event); router.refresh(); });
  const liveFlags = flags.filter((f) => !dismissed.has(f.orderId));
  const branchOrders = orders.filter((o) => !PIPELINE.includes(o.status));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="GMV (live)" value={money(gmv.grossMinor)} note={`${gmv.orders} orders`} tone="info" icon={<TrendingUp size={18} />} />
        <Kpi label="Realized" value={money(gmv.realizedMinor)} note={`${gmv.realizedRate}% fulfilled`} tone="success" icon={<ShoppingBag size={18} />} />
        <Kpi label="In flight" value={money(gmv.pendingMinor)} note="placed + accepted" tone="progress" icon={<Package size={18} />} />
        <Kpi label="Fraud review" value={String(liveFlags.length)} note={liveFlags.length ? 'human review — never auto-block' : 'queue clear'} tone={liveFlags.length ? 'warn' : 'success'} icon={<ShieldAlert size={18} />} />
      </div>

      {/* Fraud review queue (AI-E-05) */}
      {liveFlags.length > 0 && (
        <div className="bg-surface border border-warning/40 rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-warning/[0.05]"><ShieldAlert size={14} className="text-warning" /><span className="text-[12.5px] font-semibold">Fraud review queue</span><span className="text-[10.5px] text-text-3 ml-auto">AI-E-05 · signals only, never auto-block</span></div>
          <div className="divide-y divide-border">
            {liveFlags.map((f) => (
              <div key={f.orderId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize" style={{ background: `color-mix(in srgb, ${toneVar(f.severity === 'review' ? 'danger' : 'warn')} 14%, transparent)`, color: toneVar(f.severity === 'review' ? 'danger' : 'warn') }}>{f.severity}</span>
                <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{f.ref} · {f.residentName} <span className="text-text-3 font-normal">· {money(f.amountMinor)}</span></div><div className="text-[11.5px] text-text-3">{f.reason}</div></div>
                {canMutate && <button onClick={() => setDismissed((s) => new Set(s).add(f.orderId))} className="text-[11.5px] text-primary hover:underline flex items-center gap-1"><CheckCircle2 size={13} /> Mark reviewed</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline board */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-2.5">
        {PIPELINE.map((col) => {
          const cards = orders.filter((o) => o.status === col);
          return (
            <div key={col} className="bg-surface-2 border border-border rounded-2xl p-2.5 min-h-[120px]">
              <div className="flex items-center justify-between px-1 mb-2"><span className="text-[12px] font-semibold">{COL_LABEL[col]}</span><span className="text-[11px] text-text-3 tabular-nums">{cards.length}</span></div>
              <div className="flex flex-col gap-2">
                {cards.map((o) => (
                  <div key={o.id} className="bg-surface border border-border rounded-xl p-2.5 shadow-sm">
                    <div className="flex items-center justify-between"><span className="font-mono text-[12px] font-bold">{o.ref}</span><span className="text-[11px] font-semibold">{money(o.amountMinor, o.currency)}</span></div>
                    <div className="text-[12px] font-medium mt-1 truncate">{o.listingTitle}</div>
                    <div className="text-[11px] text-text-3 truncate">{o.residentName} · {o.vendorName}</div>
                    {canMutate && o.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {o.actions.map((a) => (
                          <button key={a.event} disabled={pending} onClick={() => fire(o.id, a.event)} className={`text-[11px] px-2 h-6 rounded-md font-medium disabled:opacity-50 ${a.variant === 'danger' ? 'text-negative border border-[color:var(--tone-danger)]/40' : a.variant === 'primary' ? 'bg-primary text-white' : 'border border-border-2 text-text-2'}`}>{a.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && <div className="text-[11px] text-text-3 px-1 py-3 text-center">—</div>}
              </div>
            </div>
          );
        })}
      </div>
      {branchOrders.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-[11.5px] text-text-3">
          <span className="font-medium">Closed branches:</span>
          {branchOrders.map((o) => <span key={o.id} className="px-2 h-6 inline-flex items-center rounded-md border border-border-2"><span className="font-mono mr-1.5">{o.ref}</span>{humanizeStatus(o.status)}</span>)}
        </div>
      )}

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Vendor scorecards */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Store size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Vendor performance</span></div>
          <div className="divide-y divide-border">
            {vendors.map((v) => (
              <button key={v.vendorOrgId} onClick={() => setOpenVendor(openVendor === v.vendorOrgId ? null : v.vendorOrgId)} className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors">
                <div className="flex items-center gap-3">
                  <RatingDial rating={v.rating} tone={v.tone} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold">{v.vendorName}</div>
                    <div className="text-[11.5px] text-text-3">{v.orders} orders · {money(v.gmvMinor)} GMV · {v.activeListings} active listing{v.activeListings === 1 ? '' : 's'}{v.pausedListings ? ` · ${v.pausedListings} paused` : ''}</div>
                  </div>
                </div>
                {openVendor === v.vendorOrgId && (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border animate-fade">
                    <Metric label="Acceptance" value={`${v.acceptedRate}%`} tone={v.acceptedRate >= 75 ? 'success' : 'warn'} />
                    <Metric label="Fulfilment" value={`${v.fulfilledRate}%`} tone={v.fulfilledRate >= 60 ? 'success' : 'warn'} />
                    <Metric label="Catalogue" value={`${v.activeListings}/${v.activeListings + v.pausedListings}`} tone="info" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Listings */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Package size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Listings</span><span className="ml-auto text-[10.5px] text-text-3">{listings.filter((l) => l.status === 'active').length} active</span></div>
          <div className="divide-y divide-border">
            {listings.map((l) => (
              <div key={l.id} className="px-4 py-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: toneVar(l.status === 'active' ? 'success' : 'neutral') }} />
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{l.title}</div><div className="text-[11px] text-text-3">{l.category} · {l.vendorName}</div></div>
                <span className="text-[11.5px] font-medium">{money(l.price.minor, l.price.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-3">Payout &amp; commission settlement is a separate lifecycle — blocked by PRD open question Q3. “Closed” never implies a vendor has been paid.</p>
    </div>
  );
}

function RatingDial({ rating, tone }: { rating: number; tone: Tone }) {
  const color = toneVar(tone);
  return (
    <div className="relative flex-none" style={{ width: 40, height: 40 }}>
      <svg width={40} height={40} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(rating / 100) * 94.2} 94.2`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[11px]" style={{ color }}>{rating}</span>
    </div>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return <div><div className="text-[10px] text-text-3 uppercase tracking-[0.04em]">{label}</div><div className="text-[13px] font-semibold mt-0.5" style={{ color: toneVar(tone) }}>{value}</div></div>;
}
function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
