import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { recoveryForecast } from '@/domain/estate';
import { CollectionsWorkspace, type CaseRow } from '@/components/estate/collections-workspace';

/** Collections — arrears-recovery war room: debtor risk scoring, an expected-
 *  recovery forecast, a dunning ladder (reminder → notice → plan → escalated),
 *  and promise-to-pay tracking. Gated by charges_invoicing. */
export default async function CollectionsPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const cases = repos.collectionCases.list(actor).items;

  const rows: CaseRow[] = cases.map((c) => ({
    id: c.id, invoiceRef: c.invoiceRef, residentName: c.residentName, unitLabel: c.unitLabel,
    amountMinor: c.amountMinor, agingDays: c.agingDays, stage: c.stage, remindersSent: c.remindersSent,
    promiseAmountMinor: c.promiseAmountMinor, promiseDueISO: c.promiseDueISO, promiseStatus: c.promiseStatus,
  }));

  return (
    <div className="max-w-[980px] mx-auto">
      <CollectionsWorkspace cases={rows} forecast={recoveryForecast(cases)} />
    </div>
  );
}
