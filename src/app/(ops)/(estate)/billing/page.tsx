import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import type { Invoice } from '@/domain/entities';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { BillingWorkspace } from '@/components/billing/billing-workspace';
import { estateBillingResidentOptions, listEstateRecurringRules } from '@/server/reads/estate-billing-setup';
import { operatingClock } from '@/server/operating-clock';
import { currentRecordContext } from '@/server/data/record-context';
import { isDemoAccount } from '@/server/auth/demo-config';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-01 / AI-E-03 — service charge & billing. A collections command surface:
 *  a defaulter-risk engine ranks residents by likelihood of non-payment, a
 *  forecast projects the cycle's inflow, and the arrears waterfall ages the
 *  outstanding balance. AI is assistive only — reminder campaigns need manager
 *  approval and no penalty is ever automated (AI-E-03). Everything is scoped
 *  (§8.2); Estate Manager manages, others read. */
export default async function BillingPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('charges_invoicing', 'read', 'estate');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'charges_invoicing'));
  const invoices: Invoice[] = [];
  let cursor: string | null = null;
  do {
    const page = repos.invoices.list(actor, { cursor, limit: 500 });
    invoices.push(...page.items); cursor = page.cursor;
  } while (cursor !== null);

  return (
    <div className="pb-page">
      <PageHeader title="Billing & Collections" subtitle="Invoices, collection performance and resident follow-up — one clear view."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <BillingWorkspace invoices={invoices} canMutate={canMutate} setup={currentRecordContext() ? { companyId: actor.tenantId!, residents: estateBillingResidentOptions(actor), rules: listEstateRecurringRules(actor), today: operatingClock().dateISO, canMutate, automaticGeneration: Boolean(currentRecordContext()?.companyPrincipal && !isDemoAccount(actor.userId) && process.env.NODE_ENV === 'production' && process.env.PROPBREW_ESTATE_RECURRING_WORKER !== '0') } : undefined} />
    </div>
  );
  });
}
