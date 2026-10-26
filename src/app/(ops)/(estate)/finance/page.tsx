import { can } from '@/lib/authz';
import { FinanceCommandCenter } from '@/components/finance/finance-command-center';
import { constructionControl } from '@/server/construction-control';
import { withDurableRead } from '@/server/data/durable-records';
import { financeControl } from '@/server/finance-control';
import { financeSnapshot } from '@/server/finance';
import { requireCapability } from '@/server/guard';
import { reconcileStoredSettlements } from '@/server/payments';

type Settlement = { id: string; statement_ref: string; statement_date: string; amount_minor: number | string; direction: 'credit' | 'debit'; narration: string; provider?: string | null; event_id?: string | null; payment_status?: string | null; match_status: 'matched' | 'unmatched'; status?: string };

export default async function FinancePage() {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('charges_invoicing', 'read', 'estate');
    const snapshot = financeSnapshot(actor); const control = financeControl(actor.tenantId!); const construction = constructionControl(actor.tenantId!);
    let settlements: Settlement[] = [];
    if (process.env.DATABASE_URL && /^[0-9a-f-]{36}$/i.test(actor.tenantId!)) {
      try { settlements = await reconcileStoredSettlements(actor.tenantId!) as Settlement[]; } catch { settlements = []; }
    }
    const certificates = control.whtCertificates.map((row) => ({ ...row }));
    const certified = new Set(certificates.map((row) => row.sourceId));
    const whtEligible = [
      ...control.payables.filter((row) => row.status === 'paid' && row.whtMinor > 0 && !certified.has(row.id)).map((row) => ({ id: row.id, type: 'finance_payable' as const, ref: row.ref, module: row.module, beneficiary: row.counterparty, whtMinor: row.whtMinor })),
      ...construction.payments.filter((row) => row.status === 'paid' && row.whtMinor > 0 && !certified.has(row.id)).map((row) => ({ id: row.id, type: 'construction_payment' as const, ref: row.ref, module: 'construction' as const, beneficiary: row.invoiceRef, whtMinor: row.whtMinor })),
    ];
    return <div className="pb-page"><FinanceCommandCenter
      snapshot={snapshot}
      payables={control.payables.map((row) => ({ ...row }))}
      certificates={certificates}
      whtEligible={whtEligible}
      settlements={settlements.map((row) => ({ ...row, amount_minor: Number(row.amount_minor) }))}
      canCreate={can(actor, 'charges_invoicing', 'create').allowed}
      canUpdate={can(actor, 'charges_invoicing', 'update').allowed}
      canApprove={can(actor, 'charges_invoicing', 'approve').allowed}
    /></div>;
  });
}
