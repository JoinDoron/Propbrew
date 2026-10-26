'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Banknote, Bell, CheckCheck, FileText, Info, Search, ShieldCheck, Sparkles, TrendingUp, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import { assessDefaulters, collectionsForecast, agingBuckets, BAND_TONE, type DefaulterRisk } from '@/domain/billing';
import type { Invoice } from '@/domain/entities';
import type { CurrencyCode } from '@/domain/primitives';
import { sendReminderCampaign } from '@/server/actions/billing';
import styles from './billing-workspace.module.css';
import { InvoiceCreateButton, InvoiceIssueButton, InvoiceEditButton, RecurringChargesPanel, type BillingSetupProps } from './estate-billing-setup';

const currencyNames: Record<CurrencyCode, string> = { NGN: 'NGN · Nigerian naira', USD: 'USD · US dollar', GHS: 'GHS · Ghanaian cedi', KES: 'KES · Kenyan shilling' };
const balance = (invoice: Invoice) => Math.max(0, invoice.amount.minor - invoice.paid.minor);
const money = (minor: number, currency: CurrencyCode) => new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
const compactMoney = (minor: number, currency: CurrencyCode) => new Intl.NumberFormat('en-NG', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
const riskLabel = (risk: DefaulterRisk) => risk.band === 'ok' ? 'Low risk' : risk.band === 'watch' ? 'Watch' : 'High risk';

export function BillingWorkspace({ invoices, canMutate, setup }: { invoices: Invoice[]; canMutate: boolean; setup?: BillingSetupProps }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<DefaulterRisk[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chosenCurrency, setChosenCurrency] = useState<CurrencyCode | null>(null);
  const [query, setQuery] = useState('');
  const [pageTab, setPageTab] = useState('overview');
  const [status, setStatus] = useState('all');
  const currencies = useMemo(() => [...new Set(invoices.map((invoice) => invoice.amount.currency))].sort(), [invoices]);
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : currencies.includes('NGN') ? 'NGN' : currencies[0] ?? 'NGN';
  // Each panel describes one native currency. No implicit currency conversion.
  const currencyInvoices = useMemo(() => invoices.filter((invoice) => invoice.amount.currency === currency), [invoices, currency]);
  const defaulters = useMemo(() => assessDefaulters(currencyInvoices), [currencyInvoices]);
  const forecast = useMemo(() => collectionsForecast(currencyInvoices), [currencyInvoices]);
  const buckets = useMemo(() => agingBuckets(currencyInvoices), [currencyInvoices]);
  const bucketTotal = buckets.reduce((total, bucket) => total + bucket.minor, 0);
  const highRisk = defaulters.filter((resident) => resident.band !== 'ok');
  const selectedInvoices = selected ? currencyInvoices.filter((invoice) => String(invoice.ownerUserId) === selected) : [];
  const selectedRisk = defaulters.find((resident) => resident.ownerUserId === selected) ?? null;
  const selectedName = selectedInvoices[0]?.residentName ?? '';
  const statementOutstanding = selectedInvoices.filter((invoice) => invoice.status !== 'draft').reduce((total, invoice) => total + balance(invoice), 0);
  const visibleInvoices = currencyInvoices.filter((invoice) => {
    const matchesStatus = status === 'all' || (status === 'outstanding' ? invoice.status !== 'draft' && balance(invoice) > 0 : invoice.status === status);
    return matchesStatus && `${invoice.ref} ${invoice.residentName} ${invoice.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const amount = (minor: number) => money(minor, currency);
  const runCampaign = (targets: DefaulterRisk[]) => {
    if (!canMutate || pending || targets.length === 0) return;
    start(async () => {
      try {
        // Permission-checked simulation only: this action has no delivery queue.
        const result = await sendReminderCampaign(targets.map((target) => target.ownerUserId));
        if (result.ok) {
          setCampaign(null);
          setToast(`Reminder preview completed for ${result.sent} resident${result.sent === 1 ? '' : 's'}. No messages were sent.`);
          router.refresh();
        } else setToast(result.error);
      } catch { setToast('Unable to complete the reminder preview. Please try again.'); }
    });
  };

  return <div className="pb-section">
    <div className={styles.context}>
      {canMutate && setup && <InvoiceCreateButton companyId={setup.companyId} residents={setup.residents} onCreated={() => { setChosenCurrency('NGN'); setStatus('all'); setQuery(''); setPageTab('invoices'); }} />}
      <p className={styles.metadata}>{currencyInvoices.length} recorded invoice{currencyInvoices.length === 1 ? '' : 's'} · Amounts in {currency}</p>
      <label className={styles.currency}>Currency<select value={currency} disabled={currencies.length < 2} onChange={(event) => { setChosenCurrency(event.target.value as CurrencyCode); setSelected(null); setCampaign(null); }}>
        {(currencies.length ? currencies : ['NGN'] as CurrencyCode[]).map((code) => <option key={code} value={code}>{currencyNames[code]}</option>)}
      </select></label>
    </div>
    <PageTabs label="Billing sections" activeTab={pageTab} onTabChange={setPageTab} items={[
      { id: 'overview', label: 'Overview', content: <div className="pb-section">
        <div className={styles.metrics}>
          <KpiCard label="Total billed" value={compactMoney(forecast.billedMinor, currency)} icon={<FileText size={18} />} />
          <KpiCard label="Collected" value={compactMoney(forecast.collectedMinor, currency)} icon={<CheckCheck size={18} />} />
          <KpiCard label="Outstanding" value={compactMoney(forecast.outstandingMinor, currency)} icon={<Banknote size={18} />} />
          <KpiCard label="Forecast total collection" value={compactMoney(forecast.projectedMinor, currency)} icon={<TrendingUp size={18} />} />
        </div>
        <div className={styles.analytics}>
          <Card className={styles.panel}>
            <CardHeader title="Collection performance" subtitle="Paid balances across the recorded invoices" action={<StatusPill status={currency} tone="info" />} />
            {forecast.billedMinor > 0 ? <>
              <div className={styles.collectionSummary}><CollectionDial pct={forecast.rate} projected={forecast.projectedRate} /><div><p className={styles.summaryTitle}>{amount(forecast.collectedMinor)} collected</p><p className={styles.bodySecondary}>{amount(forecast.outstandingMinor)} remains outstanding.</p><p className={styles.metadata}>Forecast: {forecast.projectedRate}% total collection</p></div></div>
              <dl className={styles.facts}><div><dt>Recorded billed amount</dt><dd>{amount(forecast.billedMinor)}</dd></div><div><dt>Additional forecast collection</dt><dd>{amount(forecast.projectedMinor - forecast.collectedMinor)}</dd></div></dl>
              <p className={styles.footnote}>The lighter ring is the forecast. Estimates use rules-based settlement assumptions, not guaranteed payments.</p>
            </> : <EmptyState icon={<Banknote size={22} />} title="No billed amounts yet" description="Issued invoices and recorded payments will appear here. Drafts are not included in collection totals." />}
          </Card>
          <Card className={styles.panel}>
            <CardHeader title="Arrears aging" subtitle="Outstanding balances by recorded days past due" action={<span className={styles.headerAmount}>{amount(bucketTotal)}</span>} />
            {bucketTotal > 0 ? <div className={styles.agingBar} role="img" aria-label={`Outstanding balance by age: ${buckets.map((bucket) => `${bucket.label}, ${amount(bucket.minor)}`).join('; ')}`}>{buckets.map((bucket) => bucket.minor > 0 && <span key={bucket.key} style={{ width: `${bucket.minor / bucketTotal * 100}%`, background: toneVar(bucket.tone) }} />)}</div> : <p className={styles.emptyNote}>No outstanding balances in the recorded invoices.</p>}
            <dl className={styles.agingLegend}>{buckets.map((bucket) => <div key={bucket.key}><dt><span className={styles.dot} style={{ background: toneVar(bucket.tone) }} />{bucket.label}</dt><dd><span>{amount(bucket.minor)}</span><span className={styles.metadata}>{bucket.count} invoice{bucket.count === 1 ? '' : 's'}</span></dd></div>)}</dl>
          </Card>
        </div>
        <Card className={styles.panel}>
          <CardHeader title="Collection decision support" subtitle="AI-E-03 · Rules-based snapshot · Human review required" action={<Sparkles size={18} className="text-primary" />} />
          <div className={styles.support}><div className={styles.supportStat}><span className={styles.supportAmount}>{amount(forecast.atRiskMinor)}</span><span className={styles.metadata}>Forecast collection shortfall</span></div><div className={styles.supportCopy}><p>{highRisk.length} resident{highRisk.length === 1 ? '' : 's'} on watch or high risk. Review each account and its invoices before deciding on follow-up.</p><p className={styles.metadata}>Scores inform review only. No automatic penalties, service restrictions or account decisions.</p></div><StatusPill status={canMutate ? 'Manager review' : 'Read-only access'} tone="info" /></div>
        </Card>
      </div> },
      { id: 'invoices', label: 'Invoices', content: <div className="pb-section">
        <Card padded={false} className={styles.panel}>
          <div className={styles.registerHeader}>
            <CardHeader title="Invoice register" subtitle="Review charges, payment status and resident statements" action={<StatusPill status={`${currencyInvoices.length} invoice${currencyInvoices.length === 1 ? '' : 's'}`} tone="muted" />} />
            <div className={styles.toolbar}><label className={styles.search}><Search size={17} aria-hidden="true" /><span className="sr-only">Search invoices</span><input type="search" placeholder="Search invoice or resident…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.statusFilter}><span className="sr-only">Invoice status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="outstanding">Outstanding</option><option value="paid">Paid</option><option value="draft">Draft</option></select></label></div>
          </div>
          {visibleInvoices.length ? <div className="pb-table-scroll" role="region" aria-label="Invoice register" tabIndex={0}>
            <table className={`pb-data-table ${styles.invoiceTable}`}>
              <thead><tr>{['Invoice', 'Resident', 'Due date', 'Status', 'Amount', 'Balance due', 'Aging', 'Statement'].map((heading) => <th key={heading} scope="col" className={['Amount', 'Balance due'].includes(heading) ? styles.numeric : undefined}>{heading}</th>)}</tr></thead>
              <tbody>{visibleInvoices.map((invoice) => <tr key={invoice.id}>
                <td><span className={styles.recordTitle}>{invoice.ref}</span><span className={styles.description}>{invoice.description}</span></td>
                <td><div className={styles.person}><Avatar name={invoice.residentName} size={32} /><span>{invoice.residentName}</span></div></td>
                <td><time dateTime={invoice.dueDate}>{formatDate(invoice.dueDate)}</time></td><td><DomainStatus type="invoice" status={invoice.status} /></td>
                <td className={styles.numeric}>{amount(invoice.amount.minor)}</td><td className={styles.numeric}>{invoice.status === 'draft' ? <span className={styles.metadata}>Not issued</span> : amount(balance(invoice))}</td>
                <td>{invoice.status === 'draft' ? <span className={styles.metadata}>—</span> : balance(invoice) === 0 ? <span className={styles.metadata}>Settled</span> : invoice.agingDays > 0 ? <span className="text-warning">{invoice.agingDays}d overdue</span> : <span className={styles.metadata}>Current</span>}</td>
                <td className={styles.rowAction}>{canMutate && setup && invoice.status === 'draft' && <><InvoiceEditButton companyId={setup.companyId} invoice={invoice} /><InvoiceIssueButton companyId={setup.companyId} invoice={invoice} /></>}<Button variant="ghost" aria-label={`View statement for ${invoice.residentName}, ${invoice.ref}`} onClick={() => setSelected(String(invoice.ownerUserId))}>View <ArrowUpRight size={15} aria-hidden="true" /></Button></td>
              </tr>)}</tbody>
            </table>
          </div> : <EmptyState icon={<FileText size={22} />} title={currencyInvoices.length ? 'No matching invoices' : 'No invoices recorded'} description={currencyInvoices.length ? 'Try another resident, invoice reference or status.' : 'Invoices in your estate scope will appear here.'} action={currencyInvoices.length ? <Button onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</Button> : undefined} />}
          <p className={styles.registerFooter}>Showing {visibleInvoices.length} of {currencyInvoices.length} recorded invoices · {currency} · Drafts are excluded from collection totals.</p>
        </Card>
      </div> },
      ...(setup ? [{ id: 'recurring', label: 'Recurring charges', content: <RecurringChargesPanel {...setup} /> }] : []),
      { id: 'risk', label: 'Risk & reminders', content: <div className="pb-section">
        <div className={styles.notice}><ShieldCheck size={18} aria-hidden="true" /><p>Review signals, not automatic decisions.<span>Risk scores use recorded arrears and invoice status. A manager must review any follow-up; penalties are never automatic.</span></p></div>
        <Card padded={false} className={styles.panel}>
          <div className={styles.registerHeader}><CardHeader title="Resident collection watchlist" subtitle={`${defaulters.length} account${defaulters.length === 1 ? '' : 's'} with open invoices · Ranked by rules-based risk score`} action={canMutate && highRisk.length > 0 ? <Button icon={<Bell size={16} />} onClick={() => { setToast(null); setCampaign(highRisk); }}>Review reminders</Button> : undefined} /></div>
          {defaulters.length ? <div className="pb-table-scroll" role="region" aria-label="Collection watchlist" tabIndex={0}><table className={`pb-data-table ${styles.riskTable}`}>
            <thead><tr>{['Resident', 'Review signal', 'Oldest arrears', 'Open invoices', 'Outstanding', 'Statement'].map((heading) => <th key={heading} scope="col" className={heading === 'Outstanding' ? styles.numeric : undefined}>{heading}</th>)}</tr></thead>
            <tbody>{defaulters.map((resident) => <tr key={resident.ownerUserId}><td><div className={styles.person}><Avatar name={resident.residentName} size={36} /><span className={styles.recordTitle}>{resident.residentName}</span></div></td><td><div className={styles.riskSignal}><StatusPill status={riskLabel(resident)} tone={BAND_TONE[resident.band]} /><span className={styles.metadata}>Score {resident.score}/100</span></div></td><td>{resident.worstAging > 0 ? `${resident.worstAging} days overdue` : <span className={styles.metadata}>Current</span>}</td><td>{resident.unpaidCount}</td><td className={styles.numeric}>{amount(resident.outstandingMinor)}</td><td className={styles.rowAction}><Button variant="ghost" aria-label={`Review account for ${resident.residentName}`} onClick={() => setSelected(resident.ownerUserId)}>Review <ArrowUpRight size={15} aria-hidden="true" /></Button></td></tr>)}</tbody>
          </table></div> : <EmptyState icon={<CheckCheck size={22} />} title="No accounts to review" description="There are no open invoice balances in the recorded invoices." />}
          <p className={styles.registerFooter}><Info size={14} aria-hidden="true" />Reminder delivery is not connected here. The review flow is a preview only; it sends no messages.</p>
        </Card>
      </div> },
    ]} />

    {selectedInvoices.length > 0 && <PortalDialog label={`${selectedName} account statement`} drawer width={620} onClose={() => setSelected(null)} canClose={!pending}>
      <div className={styles.drawer}>
        <header className={styles.dialogHeader}><div className={styles.person}><Avatar name={selectedName} size={40} /><div><h2 className={styles.dialogTitle}>{selectedName}</h2><p className={styles.metadata}>Resident account · {currency}</p></div></div><IconButton aria-label="Close account statement" disabled={pending} onClick={() => setSelected(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          {toast && !campaign && <BillingFeedback message={toast} onDismiss={() => setToast(null)} />}
          <div className={styles.balancePanel}><span className={styles.metadata}>Outstanding · Excludes drafts</span><span className={styles.balanceValue}>{amount(statementOutstanding)}</span></div>
          {selectedRisk ? <section aria-label="Account review signals"><div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>Review signals</h3><StatusPill status={`${riskLabel(selectedRisk)} · ${selectedRisk.score}/100`} tone={BAND_TONE[selectedRisk.band]} /></div><dl className={styles.drivers}>{selectedRisk.drivers.map((driver) => <div key={driver.label}><dt>{driver.label}</dt><dd>{driver.value}</dd></div>)}</dl><p className={styles.footnote}>The forecast assumes {Math.round(selectedRisk.payProbability * 100)}% settlement for this risk band. This is a modelling assumption, not a verified likelihood.</p></section> : <p className={styles.bodySecondary}>No open-invoice risk signal for this account. Paid invoices and drafts remain available below.</p>}
          <section aria-label="Resident invoice statement"><h3 className={styles.sectionTitle}>Invoice statement</h3><div className="pb-table-frame" role="region" aria-label={`${selectedName} invoices`} tabIndex={0}><table className={`pb-data-table ${styles.statementTable}`}>
            <thead><tr><th scope="col">Invoice</th><th scope="col">Status</th><th scope="col" className={styles.numeric}>Amount</th><th scope="col" className={styles.numeric}>Paid</th></tr></thead>
            <tbody>{selectedInvoices.map((invoice) => <tr key={invoice.id}><td><span className={styles.recordTitle}>{invoice.ref}</span><span className={styles.description}>Due {formatDate(invoice.dueDate)}</span></td><td><DomainStatus type="invoice" status={invoice.status} /></td><td className={styles.numeric}>{amount(invoice.amount.minor)}</td><td className={styles.numeric}>{money(invoice.paid.minor, invoice.paid.currency)}</td></tr>)}</tbody>
          </table></div></section>
          {canMutate && selectedRisk && <Button variant="primary" icon={<Bell size={16} />} disabled={pending} onClick={() => { setToast(null); setCampaign([selectedRisk]); }}>Review payment reminder</Button>}
          <p className={styles.safetyNote}><ShieldCheck size={16} aria-hidden="true" />AI-E-03 supports human review only. No automated penalties.</p>
        </div>
      </div>
    </PortalDialog>}
    {campaign && <PortalDialog label="Reminder preview" width={560} onClose={() => setCampaign(null)} canClose={!pending}>
      <div className={styles.modal}><header className={styles.dialogHeader}><div><h2 className={styles.dialogTitle}>Reminder preview</h2><p className={styles.metadata}>Manager review · {campaign.length} resident{campaign.length === 1 ? '' : 's'}</p></div><IconButton aria-label="Close reminder preview" disabled={pending} onClick={() => setCampaign(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          {toast && <BillingFeedback message={toast} onDismiss={() => setToast(null)} />}
          <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>Delivery is not connected.<span>This is a simulation. Confirming the preview does not send in-app, SMS or email messages, record a campaign, or apply a penalty.</span></p></div>
          <ul className={styles.recipientList}>{campaign.map((resident) => <li key={resident.ownerUserId}><div className={styles.person}><Avatar name={resident.residentName} size={32} /><div><p className={styles.recordTitle}>{resident.residentName}</p><span className={styles.metadata}>{riskLabel(resident)}</span></div></div><span className={styles.headerAmount}>{amount(resident.outstandingMinor)}</span></li>)}</ul>
          <div className={styles.dialogActions}><Button onClick={() => setCampaign(null)} disabled={pending}>Cancel</Button><Button variant="primary" onClick={() => runCampaign(campaign)} disabled={pending}>{pending ? 'Checking preview…' : 'Confirm preview'}</Button></div>
        </div>
      </div>
    </PortalDialog>}
    {toast && !campaign && selectedInvoices.length === 0 && <BillingFeedback floating message={toast} onDismiss={() => setToast(null)} />}
  </div>;
}

function BillingFeedback({ message, onDismiss, floating = false }: { message: string; onDismiss: () => void; floating?: boolean }) {
  return <div className={floating ? styles.toast : styles.feedback} role="status"><Info size={18} aria-hidden="true" /><span>{message}</span><IconButton aria-label="Dismiss billing notification" onClick={onDismiss}><X size={18} /></IconButton></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function CollectionDial({ pct, projected }: { pct: number; projected: number }) {
  const percent = Math.max(0, Math.min(100, pct));
  const forecastPercent = Math.max(0, Math.min(100, projected));
  return <div className={styles.ring} role="img" aria-label={`Collection rate ${percent} percent; forecast ${forecastPercent} percent`}>
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="51" fill="none" stroke="var(--surface-3)" strokeWidth="10" /><circle cx="60" cy="60" r="51" fill="none" stroke="var(--primary-weak-2)" strokeWidth="10" strokeDasharray={`${forecastPercent / 100 * 320.44} 320.44`} transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="51" fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${percent / 100 * 320.44} 320.44`} transform="rotate(-90 60 60)" /></svg>
    <div className={styles.ringValue} aria-hidden="true"><span>{percent}%</span><span>Collected</span></div>
  </div>;
}
