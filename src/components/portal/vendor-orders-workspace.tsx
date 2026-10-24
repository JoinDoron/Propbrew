'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Wallet, Clock, CheckCircle2, X } from 'lucide-react';
import { Button, CardHeader, EmptyState, IconButton } from '@/components/ui';
import { PortalCard, PortalKpi, portalMoney } from './portal-patterns';
import { PageTabs } from '@/components/ui/page-tabs';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import { DomainStatus } from '@/components/domain';
import type { OrderStatus } from '@/domain/enums';
import { orderEarnings } from '@/domain/vendor-portal';
import { transition } from '@/server/actions/transitions';
import layout from '@/components/ui/workspace-layout.module.css';

export type OrderAction = { event: string; label: string; variant: 'primary' | 'default' | 'danger' };
export type OrderView = { id: string; ref: string; listingTitle: string; residentName: string; status: OrderStatus; amountMinor: number; currency: string; placedAt: string; actions: OrderAction[] };
const DONE = ['fulfilled', 'closed', 'declined', 'refunded', 'expired'];
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Lagos' });

export function VendorOrdersWorkspace({ orders, canTransition = false }: { orders: OrderView[]; canTransition?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'new' | 'active' | 'done'>('new');
  const currencies = [...new Set(orders.map((order) => order.currency).filter(Boolean))].sort();
  const [currency, setCurrency] = useState(currencies.includes('NGN') ? 'NGN' : currencies[0] ?? 'NGN');
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const groups = { new: orders.filter((order) => order.status === 'placed'), active: orders.filter((order) => order.status === 'accepted'), done: orders.filter((order) => DONE.includes(order.status)) };
  const shown = groups[filter];
  const earnings = orderEarnings(orders.filter((order) => order.currency === currency).map((order) => ({ status: order.status, amountMinor: order.amountMinor })));
  function review(order: OrderView, action: OrderAction) {
    if (!canTransition) return;
    setDecision({ title: `Review ${action.label.toLowerCase()}`, record: `${order.ref} · ${order.listingTitle}`, description: `Record “${action.label}” for ${order.residentName}'s order of ${portalMoney(order.amountMinor, order.currency)}. This changes the order workflow only; it does not verify settlement, charge a resident, transfer a payout or perform a bank refund.`, confirmLabel: `Confirm ${action.label.toLowerCase()}`, action: () => transition('marketplace-order', order.id, action.event), onSuccess: () => { router.refresh(); setMessage(`${order.ref} workflow updated. Settlement is not confirmed by this status.`); } });
  }
  return <div className={layout.layout}>
    <PageTabs label="Vendor order sections" items={[
      { id: 'orders', label: 'Order register', content: <div className={layout.layout}><div className={layout.filters}>{([['new', 'New', groups.new.length], ['active', 'In progress', groups.active.length], ['done', 'History', groups.done.length]] as const).map(([key, label, count]) => <Button key={key} aria-pressed={filter === key} variant={filter === key ? 'primary' : 'secondary'} onClick={() => setFilter(key)}>{label} · {count}</Button>)}</div>{shown.length ? shown.map((order) => <PortalCard key={order.id}><CardHeader title={order.listingTitle} subtitle={`${order.ref} · ${fmtWhen(order.placedAt)}`} action={<DomainStatus type="order" status={order.status} />} /><div className={layout.toolbar}><p className={layout.body}>Ordered by {order.residentName}</p><p className="text-lg font-medium tabular-nums">{portalMoney(order.amountMinor, order.currency)}</p></div><div className={`${layout.filters} mt-6`}>{order.actions.map((action) => <Button key={action.event} disabled={!canTransition} variant={action.variant === 'primary' ? 'primary' : 'secondary'} className={action.variant === 'danger' ? 'text-negative' : undefined} onClick={() => review(order, action)}>{action.label}</Button>)}</div></PortalCard>) : <PortalCard><EmptyState title={filter === 'new' ? 'No new orders' : 'No orders in this view'} description="Scoped resident order records appear in their workflow stage." /></PortalCard>}</div> },
      { id: 'summary', label: 'Order summary', content: <div className={layout.layout}><div className={layout.toolbar}><p className={layout.body}>Values are grouped by their recorded currency. No FX conversion.</p><label className={layout.field}><span className={layout.label}>Summary currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className={layout.select}>{(currencies.length ? currencies : ['NGN']).map((value) => <option key={value}>{value}</option>)}</select></label></div><div className={layout.metrics}><PortalKpi label="New orders" value={String(groups.new.length)} note="All currencies · awaiting acceptance" tone="info" icon={<Inbox size={18} />} /><PortalKpi label="In progress" value={String(groups.active.length)} note="All currencies · accepted records" tone="progress" icon={<Clock size={18} />} /><PortalKpi label={`Pending order value · ${currency}`} value={portalMoney(earnings.pendingMinor, currency)} note="Not an account balance" tone="info" icon={<Wallet size={18} />} /><PortalKpi label={`Fulfilled order value · ${currency}`} value={portalMoney(earnings.earnedMinor, currency)} note={`${earnings.fulfilled} fulfilled/closed records · not settled cash`} tone="success" icon={<CheckCircle2 size={18} />} /></div></div> },
    ]} />
    <p className={layout.metadata}>Fulfilled or closed does not mean paid. Vendor payment requires verified settlement and the approved payout/KYC policy. This portal does not confirm a bank transfer or initiate one.</p>
    {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    {message && <div className={layout.feedback} role="status"><span>{message}</span><IconButton aria-label="Dismiss order message" onClick={() => setMessage(null)}><X size={18} /></IconButton></div>}
  </div>;
}
