import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { can } from '@/lib/authz';
import { getActiveUnitId } from '@/server/active-unit';
import { BillsWorkspace, type BillRow } from '@/components/portal/bills-workspace';

/** EM-01 / SC-02 (resident view, §7 O) — My Bills. Charges settle from the unit
 *  wallet; a resident may pay one or pay all, toggle auto-pay, download receipts,
 *  and see a spend breakdown. Everything else is read. */
export default async function MyBillsPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const activeUnitId = await getActiveUnitId(actor.unitIds);
  const wallet = repos.wallets.list(actor).items.find((w) => w.unitId === activeUnitId) ?? repos.wallets.list(actor).items[0];

  const invoicePage = repos.invoices.list(actor);
  const bills: BillRow[] = invoicePage.items
    .filter((i) => i.status !== 'draft')
    .map((i) => ({ id: i.id, ref: i.ref, description: i.description, status: i.status, amountMinor: i.amount.minor, paidMinor: i.paid.minor, dueDate: i.dueDate, agingDays: i.agingDays, currency: i.amount.currency, paidCurrency: i.paid.currency }));

  return (
    <div className="pb-page">
      <PageHeader title="My bills" subtitle="Review charges, pay from your wallet and keep your receipts." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <BillsWorkspace bills={bills} walletMinor={wallet?.available.minor ?? 0} walletCurrency={wallet?.available.currency ?? 'NGN'} canPay={can(actor, 'payments_in_app', 'create').allowed} completeRead={invoicePage.cursor === null} />
      </div>
    </div>
  );
}
