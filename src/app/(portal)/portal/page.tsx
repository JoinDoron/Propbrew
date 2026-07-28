import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { requireCapability } from '@/server/guard';
import { getActiveUnitId } from '@/server/active-unit';
import { repos, seed } from '@/server/data';
import { addMoney, money, type Money as MoneyValue } from '@/domain/primitives';
import { NOW_MS } from '@/domain/ppm';
import { formatMoney } from '@/components/domain';
import { humanizeStatus } from '@/lib/status-tones';
import { WalletCard } from '@/components/portal/wallet-card';
import { UnitSelector } from '@/components/portal/unit-selector';
import { ContentToggle } from '@/components/portal/content-toggle';
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
    .map((id) => seed.units.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({ id: u!.id, label: u!.label }));
  const activeUnitId = (await getActiveUnitId(actor.unitIds)) ?? unitOptions[0]?.id ?? '';

  const wallet = repos.wallets.list(actor).items.find((w) => w.unitId === activeUnitId);
  const available = wallet?.available ?? money(0);

  const unitInvoices = repos.invoices.list(actor).items.filter((i) => i.unitId === activeUnitId && UNPAID.includes(i.status));
  const pending = unitInvoices.reduce<MoneyValue>((a, i) => addMoney(a, money(i.amount.minor - i.paid.minor, i.amount.currency)), money(0));

  const myRequests = repos.workOrders.list(actor).items;
  const myBookings = repos.bookings.list(actor).items;
  const myOrders = repos.marketplaceOrders.list(actor).items;
  const anns = repos.announcements.list(actor).items.filter((a) => a.sentAt);

  const activeSos = repos.sosEvents.list(actor).items.find((s) => !['reviewed', 'resolved'].includes(s.status));
  const nextBooking = myBookings
    .filter((b) => ['approved', 'auto_approved', 'confirmed', 'requested'].includes(b.status) && Date.parse(b.slot) >= NOW_MS)
    .sort((a, b) => (a.slot < b.slot ? -1 : 1))[0];
  const activeRequest = myRequests.find((w) => !isRequestClosed(w.status));
  const activeOrder = myOrders.find((o) => isOrderOpen(o.status));

  /* --- attention digest (prioritised) --- */
  const attention: Attention[] = [];
  if (activeSos) attention.push({ kind: 'sos', title: 'Emergency alert active', sub: `${activeSos.ref} — ${activeSos.responder ? `${activeSos.responder} responding` : 'security notified'}`, href: '/portal/security', cta: 'View' });
  if (unitInvoices.length) attention.push({ kind: 'bill', title: `Pay ${formatMoney(pending)}`, sub: `${unitInvoices.length} charge${unitInvoices.length === 1 ? '' : 's'} on this unit`, href: '/portal/bills', cta: 'Pay' });
  if (nextBooking && Date.parse(nextBooking.slot) - NOW_MS <= 3 * DAY) attention.push({ kind: 'booking', title: `${nextBooking.amenity} coming up`, sub: new Date(nextBooking.slot).toLocaleString('en-NG', { weekday: 'short', hour: '2-digit', minute: '2-digit' }), href: '/portal/bookings', cta: 'Details' });
  if (activeRequest) attention.push({ kind: 'request', title: activeRequest.title, sub: `${activeRequest.ref} · ${humanizeStatus(activeRequest.status)}`, href: '/portal/requests', cta: 'Track' });
  if (activeOrder) attention.push({ kind: 'order', title: activeOrder.listingTitle, sub: `${activeOrder.ref} · ${humanizeStatus(activeOrder.status)}`, href: '/portal/marketplace', cta: 'Track' });

  /* --- estate status --- */
  const waterAdvisory = anns.find((a) => /water|supply|borehole/i.test(a.title));
  const powerAdvisory = anns.find((a) => /power|outage|light/i.test(a.title));
  const status: StatusChip[] = [
    { key: 'power', label: 'Power', value: powerAdvisory ? 'Advisory' : 'On grid', tone: powerAdvisory ? 'warn' : 'success' },
    { key: 'water', label: 'Water', value: waterAdvisory ? 'Scheduled' : 'Running', tone: waterAdvisory ? 'warn' : 'success' },
    { key: 'security', label: 'Security', value: activeSos ? 'Alert' : 'Normal', tone: activeSos ? 'danger' : 'success' },
  ];

  /* --- recent activity --- */
  const activity: Activity[] = [
    ...myRequests.map((w) => ({ kind: 'request' as const, text: `Raised “${w.title}”`, at: w.createdAt })),
    ...myBookings.map((b) => ({ kind: 'booking' as const, text: `Booked ${b.amenity}`, at: b.slot })),
    ...myOrders.map((o) => ({ kind: 'order' as const, text: `Ordered ${o.listingTitle}`, at: o.placedAt })),
    ...repos.invoices.list(actor).items.filter((i) => i.status === 'paid').map((i) => ({ kind: 'payment' as const, text: `Paid ${i.description}`, at: i.dueDate })),
  ]
    .filter((a) => !Number.isNaN(Date.parse(a.at)))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 5)
    .map((a) => ({ kind: a.kind, text: a.text, when: shortDate(a.at) }));

  return (
    <div className="max-w-[560px] mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-text-3">Welcome back</div>
          <h1 className="text-[19px] font-bold tracking-[-0.02em] leading-tight">Hi, Folake 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <UnitSelector units={unitOptions} activeId={activeUnitId} />
          <Link href="/portal/announcements" aria-label="Help" className="w-10 h-10 rounded-xl grid place-items-center border border-border bg-surface text-text-2 hover:bg-surface-2 transition"><HelpCircle size={17} /></Link>
        </div>
      </div>

      <WalletCard unitId={activeUnitId} available={available} pending={pending} pendingCount={unitInvoices.length} />

      <EstateStatus chips={status} />

      <div>
        <h2 className="text-[13.5px] font-semibold mb-2">Needs your attention</h2>
        <AttentionList items={attention} />
      </div>

      <ContentToggle community={<QuickActions />} forYou={<ActivityTimeline items={activity} />} />
    </div>
  );
}
