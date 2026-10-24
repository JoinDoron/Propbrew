'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Package, Search, ShieldAlert, ShoppingBag, Store, TrendingUp, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { DomainStatus } from '@/components/domain';
import { toneVar, humanizeStatus } from '@/lib/status-tones';
import { transition } from '@/server/actions/transitions';
import type { InlineEvent } from '@/components/inline-actions';
import type { Listing } from '@/domain/entities';
import type { OrderStatus } from '@/domain/enums';
import { PIPELINE, type Gmv, type VendorScore, type FraudFlag } from '@/domain/marketplace';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from '@/components/security/safety-market.module.css';

export type OrderView = { id: string; ref: string; residentName: string; listingTitle: string; vendorName: string; status: OrderStatus; amountMinor: number; currency: string; actions: InlineEvent[] };
const COL_LABEL: Record<string, string> = { placed: 'Placed', accepted: 'Accepted', fulfilled: 'Fulfilled', closed: 'Closed' };
export function marketplaceMoney(minor: number, currency = 'NGN'): string {
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-NG', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
}
const money = marketplaceMoney;

export function MarketplaceWorkspace({ orders, listings, gmv, vendors, flags, canMutate }: {
  orders: OrderView[]; listings: readonly Listing[]; gmv: Gmv; vendors: VendorScore[]; flags: FraudFlag[]; canMutate: boolean;
}) {
  const router = useRouter();
  const accordionId = useId();
  const [pending, start] = useTransition();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [openVendor, setOpenVendor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ order: OrderView; action: InlineEvent } | null>(null);
  const liveFlags = flags.filter((flag) => !dismissed.has(flag.orderId));
  const branchOrders = orders.filter((order) => !PIPELINE.includes(order.status));
  const currencies = [...new Set(orders.map((order) => order.currency))];
  const singleCurrency = currencies.length <= 1 ? currencies[0] ?? 'NGN' : null;
  const normalized = query.trim().toLowerCase();
  const filteredListings = listings.filter((listing) => (status === 'all' || listing.status === status) && `${listing.title} ${listing.vendorName} ${listing.category}`.toLowerCase().includes(normalized));
  const currencyFor = (orderId: string) => orders.find((order) => order.id === orderId)?.currency ?? 'NGN';

  function fire() {
    if (!canMutate || pending || !confirmation) return;
    setMessage(null);
    start(async () => {
      try {
        const result = await transition('marketplace-order', confirmation.order.id, confirmation.action.event);
        if (!result.ok) { setMessage(result.error); return; }
        setMessage(`Order ${confirmation.order.ref} updated to ${humanizeStatus(result.to)}. No money was transferred by this status change.`);
        setConfirmation(null);
        router.refresh();
      } catch { setMessage('Unable to update this order. Please try again.'); }
    });
  }

  return <div className={layout.layout}>
    {message && !confirmation && <MarketplaceFeedback message={message} onDismiss={() => setMessage(null)} />}
    {liveFlags.length > 0 && <Card className={layout.panel}>
      <CardHeader title="Fraud review queue" subtitle="Rule-based signals for a human decision. These are not AI verdicts and never block or decline an order automatically." action={<StatusPill status={`${liveFlags.length} to review`} tone="warn" />} />
      {liveFlags.map((flag) => <div key={flag.orderId} className={styles.row}>
        <StatusPill status={flag.severity} tone={flag.severity === 'review' ? 'danger' : 'warn'} />
        <div className={styles.rowContent}><p className={layout.title}>{flag.ref} · {flag.residentName}</p><p className={styles.meta}>{flag.reason} · {money(flag.amountMinor, currencyFor(flag.orderId))}</p></div>
        {canMutate && <Button type="button" variant="ghost" onClick={() => setDismissed((current) => new Set(current).add(flag.orderId))} aria-label={`Hide ${flag.ref} signal for this session`}>Hide for this session</Button>}
      </div>)}
      <p className={styles.meta}>Hiding a signal only changes this browser view; it does not save an audit review or change the order.</p>
    </Card>}
    <PageTabs label="Marketplace sections" items={[
      { id: 'orders', label: 'Order pipeline', content: <div className={layout.layout}>
        <div className={layout.context}><div><h2 className={layout.sectionTitle}>Order pipeline</h2><p className={styles.meta}>Only transitions permitted by your role and each order’s current state are available.</p></div><StatusPill status={`${orders.length} orders in scope`} tone="neutral" /></div>
        <div className={styles.pipeline}>{PIPELINE.map((column) => {
          const cards = orders.filter((order) => order.status === column);
          return <section key={column} className={styles.column} aria-label={`${COL_LABEL[column]} orders`}><h3 className={styles.columnTitle}>{COL_LABEL[column]}<span className={styles.count}>{cards.length}</span></h3><div className={styles.stack}>{cards.length ? cards.map((order) => <article key={order.id} className={styles.order}>
            <p className={`${styles.orderRef} font-mono`}>{order.ref}</p><h4 className={styles.orderTitle}>{order.listingTitle}</h4><p className={styles.meta}>{order.vendorName}</p><div className="flex items-center gap-2 mt-4"><Avatar name={order.residentName} size={28} /><span className={styles.meta}>{order.residentName}</span></div><p className={styles.orderAmount}>{money(order.amountMinor, order.currency)}</p>
            {canMutate && order.actions.length > 0 && <div className={`${layout.actions} mt-4`}>{order.actions.map((action) => <Button key={action.event} type="button" disabled={pending} variant={action.variant === 'primary' ? 'primary' : 'secondary'} className={action.variant === 'danger' ? styles.dangerButton : undefined} onClick={() => { setMessage(null); setConfirmation({ order, action }); }} aria-label={`${action.label} ${order.ref}`}>{action.label}</Button>)}</div>}
          </article>) : <p className={`${styles.meta} py-4 text-center`}>No {COL_LABEL[column].toLowerCase()} orders</p>}</div></section>;
        })}</div>
        {branchOrders.length > 0 && <Card className={layout.panel}><CardHeader title="Closed branches" subtitle="Declined, expired and refunded statuses remain visible in the record." /><div className="pb-table-scroll" role="region" aria-label="Closed marketplace branches" tabIndex={0}><table className={`pb-data-table ${layout.table}`}><thead><tr>{['Order', 'Resident', 'Status', 'Amount'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{branchOrders.map((order) => <tr key={order.id}><td className="font-mono">{order.ref}</td><td>{order.residentName}</td><td><DomainStatus type="order" status={order.status} /></td><td>{money(order.amountMinor, order.currency)}</td></tr>)}</tbody></table></div></Card>}
        {!canMutate && <p className={styles.meta}>Read-only access: order transitions and signal dismissal are unavailable for this role.</p>}
      </div> },
      { id: 'vendors', label: 'Vendor scorecards', content: <Card className={layout.panel}>
        <CardHeader title="Vendor performance" subtitle="Snapshot scorecards from acceptance, fulfilment and catalogue activity—not an AI quality assessment." action={<StatusPill status={`${vendors.length} vendors`} tone="neutral" />} />
        {vendors.length ? vendors.map((vendor, index) => {
          const expanded = openVendor === vendor.vendorOrgId;
          const panelId = `${accordionId}-vendor-${index}`;
          return <div key={vendor.vendorOrgId} className="border-b border-border last:border-0"><button type="button" className={styles.vendorToggle} aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpenVendor(expanded ? null : vendor.vendorOrgId)}><Avatar name={vendor.vendorName} size={40} /><div className={styles.rowContent}><p className={layout.title}>{vendor.vendorName}</p><p className={styles.meta}>{vendor.orders} orders · {singleCurrency ? money(vendor.gmvMinor, singleCurrency) : 'Multiple currencies—see orders'} order value · {vendor.activeListings} active listing{vendor.activeListings === 1 ? '' : 's'}{vendor.pausedListings ? ` · ${vendor.pausedListings} paused` : ''}</p></div><StatusPill status={`${vendor.rating}/100`} tone={vendor.tone} /><ChevronDown size={18} aria-hidden="true" className="text-text-3" /></button><div id={panelId} hidden={!expanded} className={styles.vendorDetail}><div><span className={styles.meta}>Acceptance</span><span className={styles.metricValue}>{vendor.orders ? `${vendor.acceptedRate}%` : 'N/A'}</span></div><div><span className={styles.meta}>Fulfilment</span><span className={styles.metricValue}>{vendor.orders ? `${vendor.fulfilledRate}%` : 'N/A'}</span></div><div><span className={styles.meta}>Active catalogue</span><span className={styles.metricValue}>{vendor.activeListings}/{vendor.activeListings + vendor.pausedListings}</span></div></div></div>;
        }) : <EmptyState icon={<Store size={24} />} title="No vendor activity" description="Vendor scorecards appear when listings or orders are recorded in your scope." />}
      </Card> },
      { id: 'catalogue', label: 'Catalogue', content: <Card className={layout.panel}>
        <CardHeader title="Listings" subtitle="Current service catalogue and recorded vendor prices." action={<StatusPill status={`${listings.filter((listing) => listing.status === 'active').length} active`} tone="success" />} />
        <div className={`${layout.toolbar} mb-6`}><label className={layout.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search marketplace listings</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listing, category or vendor…" /></label><label><span className="sr-only">Listing status</span><select className={layout.select} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option></select></label></div>
        {filteredListings.length ? <div className="pb-table-scroll" role="region" aria-label="Marketplace catalogue" tabIndex={0}><table className={`pb-data-table ${layout.table}`}><caption className="sr-only">Marketplace listings</caption><thead><tr>{['Service', 'Vendor', 'Category', 'Price', 'Status'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{filteredListings.map((listing) => <tr key={listing.id}><td><p className={layout.title}>{listing.title}</p></td><td><div className={layout.person}><Avatar name={listing.vendorName} /><span>{listing.vendorName}</span></div></td><td>{listing.category}</td><td>{money(listing.price.minor, listing.price.currency)}</td><td><StatusPill status={listing.status} tone={listing.status === 'active' ? 'success' : 'muted'} /></td></tr>)}</tbody></table></div> : <EmptyState icon={<Package size={24} />} title={listings.length ? 'No listings match this view' : 'No listings in your scope'} description="Try another filter, or return when a vendor has published a service." />}
        <p className={`${styles.meta} mt-4`}>Showing {filteredListings.length} of {listings.length} listings. Prices retain their recorded currencies.</p>
      </Card> },
      { id: 'overview', label: 'Commerce overview', content: <div className={layout.layout}>
        <div className={layout.metrics}><KpiCard label="Order value in scope" value={singleCurrency ? money(gmv.grossMinor, singleCurrency) : 'By currency'} icon={<TrendingUp size={18} />} /><KpiCard label="Fulfilled / closed value" value={singleCurrency ? money(gmv.realizedMinor, singleCurrency) : 'By currency'} icon={<ShoppingBag size={18} />} /><KpiCard label="Placed / accepted value" value={singleCurrency ? money(gmv.pendingMinor, singleCurrency) : 'By currency'} icon={<Package size={18} />} /><KpiCard label="Signals awaiting review" value={String(liveFlags.length)} icon={<ShieldAlert size={18} />} iconColor={toneVar(liveFlags.length ? 'warn' : 'success')} /></div>
        <Card className={layout.panel}><CardHeader title="Commerce snapshot" subtitle="Order values are operational records, not proof of payment or vendor settlement." /><dl className={layout.facts}><div><dt>Orders in scope</dt><dd>{gmv.orders}</dd></div><div><dt>Fulfilled / closed rate</dt><dd>{gmv.realizedRate}%</dd></div><div><dt>Active catalogue</dt><dd>{listings.filter((listing) => listing.status === 'active').length} listings</dd></div><div><dt>Payouts</dt><dd>Not connected</dd></div></dl>{!singleCurrency && <div className="mt-6"><h3 className={layout.sectionTitle}>Order value by currency</h3><dl className={layout.facts}>{currencies.map((currency) => <div key={currency}><dt>{currency}</dt><dd>{money(orders.filter((order) => order.currency === currency && PIPELINE.includes(order.status)).reduce((sum, order) => sum + order.amountMinor, 0), currency)}</dd></div>)}</dl><p className={styles.meta}>Currencies are not converted or combined.</p></div>}</Card>
      </div> },
    ]} />
    <div className={layout.notice}><ShieldAlert size={18} aria-hidden="true" /><div><p className={styles.body}>Closed does not mean the vendor has been paid.</p><p className={styles.meta}>Payout and commission settlement are a separate lifecycle, pending formal policy approval (PRD Q3). Fraud signals require human review; no automatic blocking or financial action.</p></div></div>
    {canMutate && confirmation && <PortalDialog label="Confirm marketplace order update" onClose={() => { setConfirmation(null); setMessage(null); }} canClose={!pending} width={520}><div className={layout.modal} aria-busy={pending}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>Update order status</h2><IconButton disabled={pending} aria-label="Close marketplace confirmation" onClick={() => { setConfirmation(null); setMessage(null); }}><X size={18} /></IconButton></div><div className={layout.dialogBody}><div><p className={layout.title}>{confirmation.order.ref} · {confirmation.order.listingTitle}</p><p className={styles.meta}>{confirmation.order.residentName} · {confirmation.order.vendorName}</p></div><p className={styles.body}>Record “{confirmation.action.label}” for this order?</p><p className={styles.meta}>This records a workflow status only. It does not transfer money, initiate a bank refund, confirm a gateway refund or settle a vendor payout.</p>{message && <MarketplaceFeedback message={message} onDismiss={() => setMessage(null)} />}</div><div className={styles.dialogFooter}><Button disabled={pending} onClick={() => { setConfirmation(null); setMessage(null); }}>Cancel</Button><Button variant={confirmation.action.variant === 'primary' ? 'primary' : 'secondary'} className={confirmation.action.variant === 'danger' ? styles.dangerButton : undefined} disabled={pending} onClick={fire}>{pending ? 'Recording…' : 'Confirm status change'}</Button></div></div></PortalDialog>}
  </div>;
}

function MarketplaceFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) { return <div role="status" className={layout.feedback}><span>{message}</span><IconButton aria-label="Dismiss marketplace notification" onClick={onDismiss}><X size={16} /></IconButton></div>; }
