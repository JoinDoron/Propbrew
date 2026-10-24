import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { ScopeBanner } from '@/components/domain';
import { repos } from '@/server/data';
import { recoveryForecast } from '@/domain/estate';
import { reviewCollectionInvoice } from '@/domain/estate/collection-review';
import { CollectionsWorkspace, type CaseRow } from '@/components/estate/collections-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Collections — arrears-recovery war room: debtor risk scoring, an expected-
 *  recovery forecast, a dunning ladder (reminder → notice → plan → escalated),
 *  and promise-to-pay tracking. Gated by charges_invoicing. */
export default async function CollectionsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('charges_invoicing', 'read', 'estate');
  const cases = repos.collectionCases.list(actor).items;

  const rows: CaseRow[] = cases.map((c) => {
    const invoice = repos.invoices.getByRef(actor, c.invoiceRef);
    return {
      id: c.id, invoiceRef: c.invoiceRef, residentName: c.residentName, unitLabel: c.unitLabel,
      amountMinor: c.amountMinor, agingDays: c.agingDays, stage: c.stage, remindersSent: c.remindersSent,
      promiseAmountMinor: c.promiseAmountMinor, promiseDueISO: c.promiseDueISO, promiseStatus: c.promiseStatus,
      invoiceReview: reviewCollectionInvoice(c, invoice ? [invoice] : []),
    };
  });

  return (
    <div className="pb-page">
      <PageHeader title="Collections" subtitle="A clear view of arrears, recovery cases and resident commitments."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />} />
      <CollectionsWorkspace cases={rows} forecast={recoveryForecast(cases)} canMutate={can(actor, 'charges_invoicing', 'update').allowed} />
    </div>
  );
  });
}
