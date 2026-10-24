import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { requireCapability } from '@/server/guard';
import { getActiveUnitId } from '@/server/active-unit';
import { repos, seed } from '@/server/data';
import { money, type Money as MoneyValue } from '@/domain/primitives';
import { NOW_MS } from '@/domain/ppm';
import { portalMoney } from '@/components/portal/portal-patterns';
import { CardHeader } from '@/components/ui';
import layout from '@/components/ui/workspace-layout.module.css';
import { humanizeStatus } from '@/lib/status-tones';
import { WalletCard } from '@/components/portal/wallet-card';
import { UnitSelector } from '@/components/portal/unit-selector';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { QuickActions } from '@/components/portal/quick-actions';
import { EstateStatus, AttentionList, ActivityTimeline, type Attention, type Activity, type StatusChip } from '@/components/portal/home-hub';
import { isRequestClosed, isOrderOpen } from '@/domain/resident-portal';

const UNPAID = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];
const DAY = 24 * 3600 * 1000;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });

/**
 * Resident Home — the hub. Everything re-scopes to the ACTIVE unit: the wallet,
 * an estate-status strip, a prioritised "needs your attention" digest across
 * bills/bookings/requests/orders/SOS, quick actions, and a recent-activity
 * timeline. All personalised from the resident's own scoped records (§7 O).
 */
export default async function ResidentHome() {
  const { actor } = await requireCapability('work_orders');

  const unitOptions = actor.unitIds
    .map((id) => seed.units.find((u) => u.id === id && u.tenantId === actor.tenantId))
    .filter(Boolean)
    .map((u) => ({ id: u!.id, label: u!.label }));
  const activeUnitId = (await getActiveUnitId(actor.unitIds)) ?? unitOptions[0]?.id ?? '';
  const activeUnit = seed.units.find((unit) => unit.id === activeUnitId && unit.tenantId === actor.tenantId && actor.unitIds.includes(unit.id));
  const user = seed.users.find((record) => record.id === actor.userId && record.tenantId === actor.tenantId);
  const resident = seed.residents.find((record) => record.userId === actor.userId && record.tenantId === actor.tenantId && actor.unitIds.includes(record.unitId));
  const firstName = (user?.name ?? resident?.name ?? 'there').split(' ')[0];

  const wallet = repos.wallets.list(actor).items.find((w) => w.unitId === activeUnitId);
  const available = wallet?.available ?? money(0);

  const unitInvoices = repos.invoices.list(actor).items.filter((i) => i.unitId === activeUnitId && UNPAID.includes(i.status));
  const pendingByCurrency = new Map<MoneyValue['currency'], number>();
  for (const invoice of unitInvoices) {
    if (invoice.amount.currency !== invoice.paid.currency) continue;
    pendingByCurrency.set(invoice.amount.currency, (pendingByCurrency.get(invoice.amount.currency) ?? 0) + Math.max(0, invoice.amount.minor - invoice.paid.minor));
  }
  const pending = money(pendingByCurrency.get(available.currency) ?? 0, available.currency);
  const walletInvoiceCount = unitInvoices.filter((invoice) => invoice.amount.currency === available.currency && invoice.paid.currency === available.currency).length;
  const inconsistentCurrencyCount = unitInvoices.filter((invoice) => invoice.amount.currency !== invoice.paid.currency).length;

  const myRequests = repos.workOrders.list(actor).items.filter((record) => record.unitId ? record.unitId === activeUnitId : record.estateId === activeUnit?.siteId);
  const myBookings = repos.bookings.list(actor).items.filter((record) => record.estateId === activeUnit?.siteId);
  const myOrders = repos.marketplaceOrders.list(actor).items.filter((record) => record.estateId === activeUnit?.siteId);
  const anns = repos.announcements.list(actor).items.filter((a) => a.sentAt && a.estateId === activeUnit?.siteId);

  const activeSos = repos.sosEvents.list(actor).items.find((s) => s.unitId === activeUnitId && !['reviewed', 'resolved'].includes(s.status));
  const nextBooking = myBookings
    .filter((b) => ['approved', 'auto_approved', 'confirmed', 'requested'].includes(b.status) && Date.parse(b.slot) >= NOW_MS)
    .sort((a, b) => (a.slot < b.slot ? -1 : 1))[0];
  const activeRequest = myRequests.find((w) => !isRequestClosed(w.status));
  const activeOrder = myOrders.find((o) => isOrderOpen(o.status));

  /* --- attention digest (prioritised) --- */
  const attention: Attention[] = [];
  if (activeSos) attention.push({ kind: 'sos', title: 'Emergency alert recorded', sub: `${activeSos.ref} · ${humanizeStatus(activeSos.status)}${activeSos.responder ? ` · recorded responder: ${activeSos.responder}` : ' · response not confirmed'}`, href: '/portal/security', cta: 'View' });
  for (const [currency, minor] of pendingByCurrency) attention.push({ kind: 'bill', title: `Review ${portalMoney(minor, currency)} outstanding`, sub: `${unitInvoices.filter((invoice) => invoice.amount.currency === currency && invoice.paid.currency === currency).length} charge(s) in ${currency} on this unit · no FX conversion`, href: '/portal/bills', cta: 'Review' });
  if (inconsistentCurrencyCount) attention.push({ kind: 'bill', title: 'Billing currency review needed', sub: `${inconsistentCurrencyCount} record(s) have inconsistent charge/payment currencies and are excluded from totals.`, href: '/portal/bills', cta: 'Review' });
  if (nextBooking && Date.parse(nextBooking.slot) - NOW_MS <= 3 * DAY) attention.push({ kind: 'booking', title: `${nextBooking.amenity} coming up`, sub: new Date(nextBooking.slot).toLocaleString('en-NG', { weekday: 'short', hour: '2-digit', minute: '2-digit' }), href: '/portal/bookings', cta: 'Details' });
  if (activeRequest) attention.push({ kind: 'request', title: activeRequest.title, sub: `${activeRequest.ref} · ${humanizeStatus(activeRequest.status)}`, href: '/portal/requests', cta: 'Track' });
  if (activeOrder) attention.push({ kind: 'order', title: activeOrder.listingTitle, sub: `${activeOrder.ref} · ${humanizeStatus(activeOrder.status)}`, href: '/portal/marketplace', cta: 'Track' });

  /* --- estate status --- */
  const waterAdvisory = anns.find((a) => /water|supply|borehole/i.test(a.title));
  const powerAdvisory = anns.find((a) => /power|outage|light/i.test(a.title));
  const status: StatusChip[] = [
    { key: 'power', label: 'Power notices', value: powerAdvisory ? 'Advisory recorded' : 'No advisory recorded', tone: powerAdvisory ? 'warn' : 'neutral' },
    { key: 'water', label: 'Water notices', value: waterAdvisory ? 'Advisory recorded' : 'No advisory recorded', tone: waterAdvisory ? 'warn' : 'neutral' },
    { key: 'security', label: 'Security record', value: activeSos ? 'Alert recorded' : 'No active alert recorded', tone: activeSos ? 'danger' : 'neutral' },
  ];

  /* --- recent activity --- */
  const activity: Activity[] = [
    ...myRequests.map((w) => ({ kind: 'request' as const, text: `Raised “${w.title}”`, at: w.createdAt })),
    ...myBookings.map((b) => ({ kind: 'booking' as const, text: `${b.amenity} · scheduled slot`, at: b.slot })),
    ...myOrders.map((o) => ({ kind: 'order' as const, text: `Ordered ${o.listingTitle}`, at: o.placedAt })),
    ...repos.invoices.list(actor).items.filter((i) => i.unitId === activeUnitId && i.status === 'paid').map((i) => ({ kind: 'payment' as const, text: `${i.description} · marked paid (due date shown)`, at: i.dueDate })),
  ]
    .filter((a) => !Number.isNaN(Date.parse(a.at)))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 5)
    .map((a) => ({ kind: a.kind, text: a.text, when: shortDate(a.at) }));

  return (
    <div className="pb-page">
      <PageHeader title={`Hi, ${firstName}`} subtitle="Your selected unit, recorded estate notices and account activity."
        actions={<div className="flex items-center gap-2">
          <UnitSelector units={unitOptions} activeId={activeUnitId} />
          <Link href="/portal/announcements" aria-label="View estate announcements" className="w-10 h-10 rounded-xl grid place-items-center border border-border bg-surface text-text-2 hover:bg-surface-2 transition"><HelpCircle size={17} /></Link>
        </div>}
      />
      <div className={layout.layout}>
      <p className={layout.metadata}>Recorded snapshot · {new Date(NOW_MS).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}. Notices are not live utility or security telemetry. Bills and wallet follow your selected unit; bookings, orders and common-area requests are estate/account-level where no unit link is recorded.</p>
      {activeSos ? <AttentionList items={attention.filter((item) => item.kind === 'sos')} /> : null}
      <PageTabs label="Resident home sections" items={[
        {
          id: 'overview', label: 'Overview', content: <div className={layout.layout}>
            <EstateStatus chips={status} />
            <section>
              <CardHeader title="Needs your attention" subtitle="Recorded items for this unit and account · no automatic payment or emergency dispatch" />
              <AttentionList items={attention.filter((item) => item.kind !== 'sos')} />
            </section>
          </div>
        },
        { id: 'wallet', label: 'My wallet', content: <div className={layout.layout}><WalletCard unitId={activeUnitId} available={available} pending={pending} pendingCount={walletInvoiceCount} /><p className={layout.metadata}>Wallet pending charges are shown only in {available.currency}. Other currencies remain separate in Bills and the attention list. No currency conversion is implied.</p></div> },
        { id: 'actions', label: 'Quick actions', content: <QuickActions /> },
        { id: 'activity', label: 'Recent activity', content: <ActivityTimeline items={activity} /> },
      ]} />
      </div>
    </div>
  );
}
