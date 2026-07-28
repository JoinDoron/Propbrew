import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { getActiveUnitId } from '@/server/active-unit';
import { BillsWorkspace, type BillRow } from '@/components/portal/bills-workspace';

/** EM-01 / SC-02 (resident view, §7 O) — My Bills. Charges settle from the unit
 *  wallet; a resident may pay one or pay all, toggle auto-pay, download receipts,
 *  and see a spend breakdown. Everything else is read. */
export default async function MyBillsPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const activeUnitId = await getActiveUnitId(actor.unitIds);
  const wallet = repos.wallets.list(actor).items.find((w) => w.unitId === activeUnitId) ?? repos.wallets.list(actor).items[0];

  const bills: BillRow[] = repos.invoices.list(actor).items
    .filter((i) => i.status !== 'draft')
    .map((i) => ({ id: i.id, ref: i.ref, description: i.description, status: i.status, amountMinor: i.amount.minor, paidMinor: i.paid.minor, dueDate: i.dueDate, agingDays: i.agingDays, currency: i.amount.currency }));

  return (
    <div className="max-w-[640px] mx-auto">
      <BillsWorkspace bills={bills} walletMinor={wallet?.available.minor ?? 0} />
    </div>
  );
}
