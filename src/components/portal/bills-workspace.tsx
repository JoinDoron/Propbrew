'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Info, Wallet, X } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { DomainStatus } from '@/components/domain';
import type { InvoiceStatus } from '@/domain/enums';
import { billCategory, spendBreakdown } from '@/domain/resident-portal';
import { payChargeFromWallet } from '@/server/actions/resident-home';
import { payAllOutstanding } from '@/server/actions/resident-bills';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import { portalMoney } from './portal-patterns';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './portal-workspaces.module.css';

export type BillRow = { id: string; ref: string; description: string; status: InvoiceStatus; amountMinor: number; paidMinor: number; dueDate: string; agingDays: number; currency: string; paidCurrency?: string };
const UNPAID = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];

export function BillsWorkspace({ bills, walletMinor, walletCurrency = 'NGN', canPay = false, completeRead = true }: { bills: BillRow[]; walletMinor: number; walletCurrency?: string; canPay?: boolean; completeRead?: boolean }) {
  const router = useRouter();
  const currencies = [...new Set(bills.map((b) => b.currency))];
  const [currency, setCurrency] = useState(currencies.includes(walletCurrency) ? walletCurrency : currencies[0] ?? walletCurrency);
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inCurrency = bills.filter((b) => b.currency === currency && (!b.paidCurrency || b.paidCurrency === currency));
  const inconsistent = bills.filter((b) => b.paidCurrency && b.paidCurrency !== b.currency);
  const outstanding = inCurrency.filter((b) => UNPAID.includes(b.status));
  const paid = inCurrency.filter((b) => b.status === 'paid');
  const owedTotal = outstanding.reduce((n, b) => n + Math.max(0, b.amountMinor - b.paidMinor), 0);
  const allOutstanding = bills.filter((b) => UNPAID.includes(b.status));
  const safeWalletCurrency = walletCurrency === 'NGN';
  const canPayAll = canPay && completeRead && safeWalletCurrency && allOutstanding.length > 0 && allOutstanding.every((b) => b.currency === 'NGN' && (!b.paidCurrency || b.paidCurrency === 'NGN'));
  const breakdown = spendBreakdown(paid.map((b) => ({ description: b.description, paidMinor: b.paidMinor })));
  const spendMax = Math.max(...breakdown.map((s) => s.minor), 1);
  function reviewPayment(bill?: BillRow) {
    if (!canPay || (bill ? !safeWalletCurrency || bill.currency !== walletCurrency || (bill.paidCurrency && bill.paidCurrency !== walletCurrency) : !canPayAll)) return;
    setDecision({ title: bill ? 'Review wallet payment' : 'Review all wallet payments', record: bill ? `${bill.ref} · ${portalMoney(Math.max(0, bill.amountMinor - bill.paidMinor), bill.currency)}` : `${allOutstanding.length} outstanding charges · NGN only`, description: bill ? `Pay the remaining amount for “${bill.description}” from the linked unit’s wallet. This updates the application’s wallet ledger; it is not proof of a gateway or bank settlement.` : 'Attempt to settle all outstanding charges on your linked units from their respective wallets. Charges without sufficient funds may be skipped. No bank account is debited and no currency conversion is performed.', confirmLabel: bill ? 'Confirm wallet payment' : 'Confirm all wallet payments', action: async () => {
      if (bill) { const ref = bill.ref; const result = await payChargeFromWallet(ref); if (result.ok) setFeedback(`${ref}: wallet payment recorded. Refresh source records to verify the final ledger state.`); return result; }
      const result = await payAllOutstanding(); if (result.ok) setFeedback(`${result.count} charge(s) cleared · ${portalMoney(result.totalMinor)}.${result.skipped ? ` ${result.skipped} charge(s) skipped because of insufficient funds.` : ''}`); return result;
    }, onSuccess: () => router.refresh() });
  }
  function receipt(b: BillRow) {
    const text = `Propbrew — RECORDED PAYMENT SUMMARY\n\nCharge: ${b.ref}\nDescription: ${b.description}\nCategory: ${billCategory(b.description)}\nRecorded paid: ${portalMoney(b.paidMinor, b.paidCurrency ?? b.currency)}\nRecorded status: ${b.status}\n\nApplication ledger summary; not independent bank or payment-gateway verification.`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `payment-summary-${b.ref}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className={common.layout}>
    {inconsistent.length > 0 && <Card><CardHeader title="Currency records need review" subtitle="These records are excluded from calculated balances and payments; their absence from a total does not mean they are settled." /><ul className={common.list}>{inconsistent.map((b) => <li key={b.id} className={common.listRow}><div className="flex-1 min-w-0"><span className={common.title}>{b.ref} · {b.description}</span><span className={common.metadata}>Charge {portalMoney(b.amountMinor, b.currency)} · Recorded paid {portalMoney(b.paidMinor, b.paidCurrency)} · {b.status.replaceAll('_', ' ')}</span></div><StatusPill status="Finance review required" tone="warn" /></li>)}</ul></Card>}
    <div className={common.toolbar}><p className={common.metadata}>Native amounts only · No FX conversion</p><label className={common.field}><span className={common.label}>Bill currency</span><select className={common.select} value={currency} onChange={(e) => setCurrency(e.target.value)}>{(currencies.length ? currencies : [walletCurrency]).map((c) => <option key={c}>{c}</option>)}</select></label></div>
    <PageTabs label="Bills and payments sections" items={[
      { id: 'charges', label: 'Charges to pay', content: <div className={common.layout}>
        <div className={styles.cardGrid}><KpiCard label={`Outstanding · ${currency}`} value={portalMoney(owedTotal, currency)} icon={<Wallet size={18} />} /><KpiCard label={`Active unit wallet · ${walletCurrency}`} value={portalMoney(walletMinor, walletCurrency)} icon={<Wallet size={18} />} /></div>
        <Card className={common.panel}><CardHeader title="Charges to pay" subtitle="Review the charge and unit wallet before confirming a payment." action={canPayAll ? <Button type="button" variant="primary" onClick={() => reviewPayment()}>Review pay all</Button> : undefined} />
          {outstanding.length ? <ul className={common.list}>{outstanding.map((b) => <li key={b.id} className={common.listRow}><div className="flex-1 min-w-0"><span className={common.title}>{b.description}</span><span className={common.metadata}>{b.ref} · Due {b.dueDate}{b.agingDays > 0 ? ` · ${b.agingDays} days overdue` : ''}</span></div><div><span className={common.title}>{portalMoney(Math.max(0, b.amountMinor - b.paidMinor), b.currency)}</span><DomainStatus type="invoice" status={b.status} /></div>{canPay && <Button type="button" disabled={!safeWalletCurrency || b.currency !== walletCurrency} onClick={() => reviewPayment(b)} aria-label={`Review payment for ${b.ref}`}>Review payment</Button>}</li>)}</ul> : <EmptyState title="No outstanding charges in this currency." />}
          <p className={common.footnote}>Auto-pay is not connected. Wallet settlement here is restricted to NGN while server-side multi-currency payment checks await verification. “Pay all” is unavailable for incomplete or mixed-currency records. The active-unit wallet balance may not cover another linked unit.</p>
        </Card>
      </div> },
      { id: 'history', label: 'Payment history', content: <Card className={common.panel}><CardHeader title="Payment history" subtitle={`Recorded paid invoices · ${currency}`} />{paid.length ? <ul className={common.list}>{paid.map((b) => <li key={b.id} className={common.listRow}><div className="flex-1 min-w-0"><span className={common.title}>{b.description}</span><span className={common.metadata}>{b.ref}</span></div><span className={common.title}>{portalMoney(b.paidMinor, b.currency)}</span><Button type="button" icon={<Download size={16} />} aria-label={`Download payment summary ${b.ref}`} onClick={() => receipt(b)}>Summary</Button></li>)}</ul> : <EmptyState title="No payment history yet." />}</Card> },
      { id: 'spending', label: 'Spending breakdown', content: <Card><CardHeader title="Where your money goes" subtitle={`Recorded paid amounts by category · ${currency}`} />{breakdown.length ? <div className={common.stack}>{breakdown.map((s) => <div key={s.category}><div className={common.toolbar}><span className={common.body}>{s.category}</span><span className={common.title}>{portalMoney(s.minor, currency)}</span></div><progress className="mt-3 w-full h-2 accent-primary" max={spendMax} value={s.minor} aria-label={`${s.category} paid amount`} /></div>)}</div> : <EmptyState title="A spending breakdown appears after charges are paid." />}</Card> },
    ]} />
    <div className={common.notice}><Info size={18} /><p>Recorded wallet operations<span>Payment summaries reflect application records, not a bank statement. Provider callbacks, settlement confirmation and durable receipts require live integration verification.</span></p></div>
    {feedback && <div className={common.feedback} role="status"><span>{feedback}</span><IconButton type="button" aria-label="Dismiss payment feedback" onClick={() => setFeedback(null)}><X size={18} /></IconButton></div>}
    {!canPay && <StatusPill status="Read-only billing access" tone="muted" />}
    {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
  </div>;
}
