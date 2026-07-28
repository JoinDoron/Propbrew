'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Wallet, Clock, CheckCircle2, User } from 'lucide-react';
import { formatMoney, DomainStatus } from '@/components/domain';
import { toneVar, type Tone } from '@/lib/status-tones';
import type { OrderStatus } from '@/domain/enums';
import { orderEarnings } from '@/domain/vendor-portal';
import { transition } from '@/server/actions/transitions';

export type OrderAction = { event: string; label: string; variant: 'primary' | 'default' | 'danger' };
export type OrderView = { id: string; ref: string; listingTitle: string; residentName: string; status: OrderStatus; amountMinor: number; currency: string; placedAt: string; actions: OrderAction[] };

const money = (m: number, c = 'NGN') => formatMoney({ minor: m, currency: c } as Parameters<typeof formatMoney>[0]);
const NEW = ['placed'];
const ACTIVE = ['accepted'];
const DONE = ['fulfilled', 'closed', 'declined', 'refunded', 'expired'];
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });

export function VendorOrdersWorkspace({ orders }: { orders: OrderView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<'new' | 'active' | 'done'>('new');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const fire = (id: string, event: string, label: string) => start(async () => {
    const r = await transition('marketplace-order', id, event);
    if (r.ok) { router.refresh(); flash(`${label} — order updated.`); } else flash('error' in r ? r.error : 'Could not update order.');
  });

  const earn = orderEarnings(orders.map((o) => ({ status: o.status, amountMinor: o.amountMinor })));
  const groups = { new: orders.filter((o) => NEW.includes(o.status)), active: orders.filter((o) => ACTIVE.includes(o.status)), done: orders.filter((o) => DONE.includes(o.status)) };
  const shown = groups[tab];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-2.5">
        <Kpi label="New" value={String(groups.new.length)} note="to accept" tone={groups.new.length ? 'warn' : 'success'} icon={<Inbox size={17} />} />
        <Kpi label="In progress" value={String(groups.active.length)} note="accepted" tone="progress" icon={<Clock size={17} />} />
        <Kpi label="Pending value" value={money(earn.pendingMinor)} note="not yet paid" tone="info" icon={<Wallet size={17} />} />
        <Kpi label="Earned" value={money(earn.earnedMinor)} note={`${earn.fulfilled} fulfilled`} tone="success" icon={<CheckCircle2 size={17} />} />
      </div>

      <div className="flex gap-1.5">
        {([['new', 'New', groups.new.length], ['active', 'In progress', groups.active.length], ['done', 'History', groups.done.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium border ${tab === k ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{label} · {n}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-2xl">
          <Inbox size={24} className="mx-auto text-text-3 mb-2" />
          <p className="text-[13px] font-medium">{tab === 'new' ? 'No new orders' : 'Nothing here'}</p>
          {tab === 'new' && <p className="text-[12px] text-text-3 mt-0.5">New resident orders land here to accept.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((o) => (
            <div key={o.id} className={`rounded-2xl border shadow-card p-4 ${o.status === 'placed' ? 'border-primary/25 bg-primary/[0.03]' : 'border-border bg-surface'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{o.listingTitle}</div>
                  <div className="text-[11.5px] text-text-3 flex items-center gap-1"><User size={11} /> {o.residentName} · <span className="font-mono">{o.ref}</span> · {fmtWhen(o.placedAt)}</div>
                </div>
                <div className="text-right flex-none"><div className="text-[15px] font-bold font-mono">{money(o.amountMinor, o.currency)}</div><DomainStatus type="order" status={o.status} /></div>
              </div>
              {o.status === 'placed' && <div className="text-[11px] text-warning mt-2 flex items-center gap-1"><Clock size={11} /> Accept promptly — orders auto-expire if the accept window lapses.</div>}
              {o.actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {o.actions.map((a) => (
                    <button key={a.event} disabled={pending} onClick={() => fire(o.id, a.event, a.label)} className={`text-[12px] px-3 h-8 rounded-lg font-medium disabled:opacity-50 ${a.variant === 'danger' ? 'text-negative border border-[color:var(--tone-danger)]/40' : a.variant === 'primary' ? 'bg-primary text-white' : 'border border-border-2 text-text-2'}`}>{a.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-3">Payment is released to you on fulfilment (SC-02). Closed never means paid until settlement (Q3).</p>
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
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
