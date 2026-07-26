import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { requireCapability } from '@/server/guard';
import { getActiveUnitId } from '@/server/active-unit';
import { repos, seed } from '@/server/data';
import { addMoney, money, type Money as MoneyValue } from '@/domain/primitives';
import { Card } from '@/components/ui';
import { DomainStatus, Money } from '@/components/domain';
import { WalletCard } from '@/components/portal/wallet-card';
import { UnitSelector } from '@/components/portal/unit-selector';
import { PromoBanner } from '@/components/portal/promo-banner';
import { ContentToggle } from '@/components/portal/content-toggle';
import { QuickActions } from '@/components/portal/quick-actions';

const UNPAID = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];

/**
 * Resident Home — the post-login landing (resident-home PRD). Everything below
 * the header reflects the ACTIVE unit: the wallet, the pending charges and the
 * "For You" content are all re-scoped when the unit selector changes.
 */
export default async function ResidentHome() {
  const { actor } = await requireCapability('work_orders');

  const unitOptions = actor.unitIds
    .map((id) => seed.units.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({ id: u!.id, label: u!.label }));
  const activeUnitId = (await getActiveUnitId(actor.unitIds)) ?? unitOptions[0]?.id ?? '';

  // Wallet for the active unit (default ₦0 if none).
  const wallet = repos.wallets.list(actor).items.find((w) => w.unitId === activeUnitId);
  const available = wallet?.available ?? money(0);

  // Pending = uncleared issued charges for the active unit (derived, never stored).
  const unitInvoices = repos.invoices.list(actor).items.filter((i) => i.unitId === activeUnitId && UNPAID.includes(i.status));
  const pending = unitInvoices.reduce<MoneyValue>((a, i) => addMoney(a, money(i.amount.minor - i.paid.minor, i.amount.currency)), money(0));

  // "For You" — personalised from the resident's own records.
  const myRequests = repos.workOrders.list(actor).items;
  const myBookings = repos.bookings.list(actor).items.filter((b) => ['approved', 'auto_approved', 'confirmed'].includes(b.status));
  const nextBooking = myBookings.sort((a, b) => (a.slot < b.slot ? -1 : 1))[0];
  const recentRequest = myRequests[0];

  const firstName = 'Folake';

  return (
    <div className="max-w-[560px] mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-text-3">Welcome back</div>
          <h1 className="text-[19px] font-bold tracking-[-0.02em] leading-tight">Hi, {firstName} 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <UnitSelector units={unitOptions} activeId={activeUnitId} />
          <Link href="/portal/announcements" aria-label="Help" className="w-10 h-10 rounded-xl grid place-items-center border border-border bg-surface text-text-2 hover:bg-surface-2 transition">
            <HelpCircle size={17} />
          </Link>
        </div>
      </div>

      <WalletCard unitId={activeUnitId} available={available} pending={pending} pendingCount={unitInvoices.length} />

      <PromoBanner />

      <ContentToggle
        community={<QuickActions />}
        forYou={
          <div className="flex flex-col gap-2.5">
            {unitInvoices.length > 0 && (
              <ForYouRow href="/portal/bills" title="You have pending charges" sub={`${unitInvoices.length} charge(s) on this unit`}>
                <Money value={pending} />
              </ForYouRow>
            )}
            {nextBooking && (
              <ForYouRow href="/portal/bookings" title={`Upcoming: ${nextBooking.amenity}`} sub={new Date(nextBooking.slot).toLocaleString('en-NG', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}>
                <DomainStatus type="booking" status={nextBooking.status} />
              </ForYouRow>
            )}
            {recentRequest && (
              <ForYouRow href="/portal/requests" title={recentRequest.title} sub={`Request ${recentRequest.ref}`}>
                <DomainStatus type="work_order" status={recentRequest.status} />
              </ForYouRow>
            )}
            <div className="text-[12px] text-text-3 text-center py-2">Personalised for you · more coming soon</div>
          </div>
        }
      />
    </div>
  );
}

function ForYouRow({ href, title, sub, children }: { href: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block">
      <Card className="flex items-center gap-3 hover:bg-surface-2 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{title}</div>
          <div className="text-[11.5px] text-text-3">{sub}</div>
        </div>
        <div className="flex-none">{children}</div>
      </Card>
    </Link>
  );
}
