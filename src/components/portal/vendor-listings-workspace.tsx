'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Store, Wallet, Package, ShoppingBag } from 'lucide-react';
import { Button, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import { PortalCard, PortalKpi, portalMoney } from './portal-patterns';
import { PortalDialog } from './portal-dialog';
import { PageTabs } from '@/components/ui/page-tabs';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import { listingStats, perListing } from '@/domain/vendor-portal';
import { createListing, toggleListing } from '@/server/actions/vendor-listings';
import layout from '@/components/ui/workspace-layout.module.css';

export type ListingCard = { id: string; title: string; category: string; status: string; priceMinor: number; currency: string };
export type OrderLite = { listingTitle: string; amountMinor: number; status: string; currency?: string };
const CATEGORIES = ['HVAC', 'Plumbing', 'Electrical', 'Cleaning', 'Refrigeration', 'Security', 'General'];

export function VendorListingsWorkspace({ listings, orders, canCreate = false, canUpdate = false }: { listings: ListingCard[]; orders: OrderLite[]; canCreate?: boolean; canUpdate?: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const currencies = [...new Set([...listings.map((listing) => listing.currency), ...orders.map((order) => order.currency).filter((currency): currency is string => Boolean(currency))])].sort();
  const [currency, setCurrency] = useState(currencies.includes('NGN') ? 'NGN' : currencies[0] ?? 'NGN');
  const stats = listingStats(listings.map((listing) => ({ id: listing.id, status: listing.status, priceMinor: listing.priceMinor })), orders.filter((order) => order.currency === currency));
  function review(listing: ListingCard) {
    if (!canUpdate) return;
    const active = listing.status === 'active';
    setDecision({ title: active ? 'Pause service listing' : 'Activate service listing', record: `${listing.title} · ${portalMoney(listing.priceMinor, listing.currency)}`, description: active ? 'Pause this marketplace listing so residents cannot place new orders against it. Existing orders remain unchanged.' : 'Activate this service for residents in its marketplace scope. Review the service, recorded price and your ability to fulfil it before making it orderable. This does not verify KYC or a payout account.', confirmLabel: active ? 'Confirm pause' : 'Confirm activation', action: () => toggleListing(listing.id), onSuccess: () => { router.refresh(); setMessage(active ? 'Service listing paused.' : 'Service listing activated in the marketplace record.'); } });
  }
  return <div className={layout.layout}>
    <div className={layout.toolbar}><p className={layout.body}>Your service catalogue and recorded order performance.</p><Button variant="primary" icon={<Plus size={18} />} disabled={!canCreate} onClick={() => setCreating(true)}>New listing</Button></div>
    <PageTabs label="Vendor service sections" items={[
      { id: 'services', label: 'My services', content: <div className={layout.layout}>{listings.length ? listings.map((listing) => { const performance = perListing(listing.title, orders.filter((order) => order.currency === listing.currency)); const active = listing.status === 'active'; return <PortalCard key={listing.id}><CardHeader title={listing.title} subtitle={listing.category} action={<StatusPill status={active ? 'Active' : 'Paused'} tone={active ? 'success' : 'neutral'} />} /><p className="text-xl font-medium tabular-nums">{portalMoney(listing.priceMinor, listing.currency)}</p><p className={`${layout.body} mt-4`}>{performance.orders} title-matched {listing.currency} orders · {portalMoney(performance.revenueMinor, listing.currency)} fulfilled/closed value, not confirmed cash.</p><div className={`${layout.actions} mt-6`}><Button disabled={!canUpdate} onClick={() => review(listing)}>{active ? 'Pause' : 'Activate'}</Button></div></PortalCard>; }) : <PortalCard><EmptyState title="No listings yet" description="An authorized vendor can publish a service for residents in the current marketplace scope." /></PortalCard>}</div> },
      { id: 'performance', label: 'Service performance', content: <div className={layout.layout}><div className={layout.toolbar}><p className={layout.body}>Currency-separated values · no FX conversion</p><label className={layout.field}><span className={layout.label}>Performance currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className={layout.select}>{(currencies.length ? currencies : ['NGN']).map((value) => <option key={value}>{value}</option>)}</select></label></div><div className={layout.metrics}><PortalKpi label="Active listings" value={String(stats.live)} note={`${stats.paused} paused · all listing currencies`} tone="success" icon={<Package size={18} />} /><PortalKpi label={`Recorded orders · ${currency}`} value={String(stats.orders)} note="Selected currency only" tone="info" icon={<ShoppingBag size={18} />} /><PortalKpi label={`Fulfilled value · ${currency}`} value={portalMoney(stats.revenueMinor, currency)} note="Not verified vendor settlement" tone="progress" icon={<Wallet size={18} />} /></div><PortalCard><CardHeader title="How performance is calculated" /><p className={layout.body}>Per-service attribution currently matches the recorded service title. Values only combine records with the same currency. A fulfilled or closed order does not prove a bank settlement, and records without a currency are excluded from financial totals.</p></PortalCard></div> },
    ]} />
    {canCreate && creating && <CreateDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); setMessage('Listing activated in the marketplace record. No payment or KYC verification was performed.'); }} />}
    {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    {message && <div className={layout.feedback} role="status"><span>{message}</span><IconButton aria-label="Dismiss listing message" onClick={() => setMessage(null)}><X size={18} /></IconButton></div>}
  </div>;
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() {
    if (inFlight.current) return;
    inFlight.current = true; setError(null);
    start(async () => {
      try { const result = await createListing({ title, category, priceNaira: Number(price) }); if (!result.ok) { setError(result.error); return; } router.refresh(); onDone(); }
      catch { setError('The service listing could not be published. Please try again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <PortalDialog label="New service listing" onClose={onClose} width={600} canClose={!pending}><div className={layout.modal}><header className={layout.dialogHeader}><h2 className={layout.dialogTitle}>Publish a service listing</h2><IconButton type="button" aria-label="Close dialog" disabled={pending} onClick={onClose}><X size={18} /></IconButton></header><form className={layout.dialogBody} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending} className="border-0 p-0 m-0 min-w-0 flex flex-col gap-6">
    <label className={layout.field}><span className={layout.label}>Service title</span><input required maxLength={160} autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. AC deep-clean and servicing" className={layout.control} /></label>
    <label className={layout.field}><span className={layout.label}>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={layout.control}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className={layout.field}><span className={layout.label}>Price in NGN</span><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25000.00" className={layout.control} /></label>
    <div className={layout.notice}><Store size={18} /><p>Publishing makes this service active<span>Residents in the current marketplace scope can order it. Review the title, category and exact NGN price before confirming. No KYC or settlement account is verified by publishing.</span></p></div>
    {error && <p role="alert" className="text-sm text-negative">{error}</p>}
    <div className={layout.actions}><Button type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !title.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0}>{pending ? 'Publishing…' : 'Confirm and publish'}</Button></div>
  </fieldset></form></div></PortalDialog>;
}
