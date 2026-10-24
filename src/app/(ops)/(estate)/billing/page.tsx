import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { BillingWorkspace } from '@/components/billing/billing-workspace';

/** EM-01 / AI-E-03 — service charge & billing. A collections command surface:
 *  a defaulter-risk engine ranks residents by likelihood of non-payment, a
 *  forecast projects the cycle's inflow, and the arrears waterfall ages the
 *  outstanding balance. AI is assistive only — reminder campaigns need manager
 *  approval and no penalty is ever automated (AI-E-03). Everything is scoped
 *  (§8.2); Estate Manager manages, others read. */
export default async function BillingPage() {
  const { actor } = await requireCapability('charges_invoicing', 'read', 'estate');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'charges_invoicing'));
  const invoices = [...repos.invoices.list(actor).items];

  return (
    <div className="pb-page">
      <PageHeader title="Billing & Collections" subtitle="Invoices, collection performance and resident follow-up — one clear view."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <BillingWorkspace invoices={invoices} canMutate={canMutate} />
    </div>
  );
}
