'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Banknote, Bell, HandCoins, Info, Search, ShieldCheck, Sparkles, TrendingUp, TriangleAlert, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { toneVar, type Tone } from '@/lib/status-tones';
import { debtorRisk, DUNNING_LABEL, nextDunningStage, type DunningStage, type PromiseStatus } from '@/domain/estate';
import { sendReminder, advanceDunning } from '@/server/actions/estate';
import { CollectionPromiseDialog } from './collection-promise-dialog';
import { collectionMoney as money, collectionDate, type CaseRow } from './collections-types';
import styles from './collections-workspace.module.css';

export type { CaseRow } from './collections-types';
const STAGES: DunningStage[] = ['reminder', 'notice', 'plan', 'escalated'];
const STAGE_TONE: Record<DunningStage, Tone> = { reminder: 'info', notice: 'warn', plan: 'progress', escalated: 'danger' };
const PROMISE_TONE: Record<PromiseStatus, Tone> = { pending: 'info', kept: 'success', broken: 'danger' };
const compactMoney = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
const riskLabel = (c: CaseRow) => debtorRisk(c).band === 'success' ? 'Lower risk' : debtorRisk(c).label;
type FollowUp = { caseId: string; type: 'reminder' | 'advance' };

export function CollectionsWorkspace({ cases, forecast, canMutate }: {
  cases: CaseRow[];
  forecast: { outstandingMinor: number; expectedMinor: number; recoveryPct: number };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [promiseFor, setPromiseFor] = useState<CaseRow | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');

  const sorted = [...cases].sort((a, b) => debtorRisk(b).score - debtorRisk(a).score);
  const highRisk = cases.filter((c) => debtorRisk(c).band === 'danger').length;
  const promiseCases = sorted.filter((c) => c.promiseStatus);
  const pendingPromises = cases.filter((c) => c.promiseStatus === 'pending');
  const selected = cases.find((c) => c.id === selectedId) ?? null;
  const confirmationCase = cases.find((c) => c.id === followUp?.caseId) ?? null;
  const filtered = sorted.filter((c) => (stage === 'all' || c.stage === stage) && `${c.residentName} ${c.unitLabel} ${c.invoiceRef}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const openCase = (c: CaseRow) => { setMessage(null); setSelectedId(c.id); };
  const reviewFollowUp = (c: CaseRow, type: FollowUp['type']) => {
    if (!canMutate || pending) return;
    setMessage(null);
    setFollowUp({ caseId: c.id, type });
  };

  function confirmFollowUp() {
    if (!canMutate || pending || !followUp || !confirmationCase) return;
    const c = confirmationCase;
    const type = followUp.type;
    if (type === 'advance' && c.stage === 'escalated') return;
    start(async () => {
      try {
        const result = type === 'reminder' ? await sendReminder(c.id) : await advanceDunning(c.id);
        if (!result.ok) { setMessage(result.error); return; }
        setFollowUp(null);
        setMessage(type === 'reminder' ? `Reminder entry recorded · ${c.invoiceRef}. No message was sent.` : `Collection stage updated · ${c.invoiceRef}.`);
        router.refresh();
      } catch { setMessage('Unable to update this collection case. Please try again.'); }
    });
  }

  return <div className="pb-section">
    <div className={styles.context}><p className={styles.metadata}>{cases.length} recorded collection case{cases.length === 1 ? '' : 's'} · Amounts in NGN (₦)</p><StatusPill status={canMutate ? 'Manager access' : 'Read-only access'} tone="info" /></div>
    <PageTabs label="Collection sections" items={[
      { id: 'overview', label: 'Recovery overview', content: <div className="pb-section">
        <div className={styles.metrics}>
          <KpiCard label="Outstanding" value={compactMoney(forecast.outstandingMinor)} icon={<Banknote size={18} />} />
          <KpiCard label="Risk-weighted estimate" value={compactMoney(forecast.expectedMinor)} icon={<TrendingUp size={18} />} />
          <KpiCard label="High-risk cases" value={String(highRisk)} icon={<TriangleAlert size={18} />} />
          <KpiCard label="Promises pending" value={String(pendingPromises.length)} icon={<HandCoins size={18} />} />
        </div>
        <div className={styles.analytics}>
          <Card className={styles.panel}>
            <CardHeader title="Recovery outlook" subtitle="An advisory estimate from recorded case balances" action={<Sparkles size={18} className="text-primary" />} />
            {forecast.outstandingMinor > 0 ? <>
              <div className={styles.recoverySummary}><RecoveryRing pct={forecast.recoveryPct} /><div><p className={styles.summaryTitle}>{money(forecast.expectedMinor)} estimated recovery</p><p className={styles.bodySecondary}>From {money(forecast.outstandingMinor)} outstanding.</p><p className={styles.metadata}>Weighted by recorded arrears, exposure and promise status.</p></div></div>
              <dl className={styles.facts}><div><dt>Recorded outstanding balance</dt><dd>{money(forecast.outstandingMinor)}</dd></div><div><dt>Outside the recovery estimate</dt><dd>{money(forecast.outstandingMinor - forecast.expectedMinor)}</dd></div></dl>
              <p className={styles.footnote}>Rules-based snapshot, not a payment prediction or cash received. Review every case before deciding on follow-up.</p>
            </> : <EmptyState icon={<Banknote size={22} />} title="No outstanding recovery balance" description="Recorded arrears will appear here when a collection case needs follow-up." />}
          </Card>
          <Card className={styles.panel}>
            <CardHeader title="Collection stages" subtitle="Current workflow position across recorded cases" />
            <div className={styles.stageSummary}>{STAGES.map((s) => {
              const count = cases.filter((c) => c.stage === s).length;
              return <div key={s}><div className={styles.barLabel}><span>{DUNNING_LABEL[s]}</span><span>{count} case{count === 1 ? '' : 's'}</span></div><div className={styles.track} role="img" aria-label={`${DUNNING_LABEL[s]}: ${count} of ${cases.length} recorded cases`}><span style={{ width: `${cases.length ? count / cases.length * 100 : 0}%`, background: toneVar(STAGE_TONE[s]) }} /></div></div>;
            })}</div>
            <p className={styles.footnote}>A stage records workflow position only. It is not evidence that a notice or message was delivered.</p>
          </Card>
        </div>
        <div className={styles.analytics}>
          <Card className={styles.panel}>
            <CardHeader title="Priority review" subtitle="Highest review scores first · No automatic penalties" />
            {sorted.length ? <ul className={styles.reviewList}>{sorted.slice(0, 3).map((c) => <li key={c.id}><div className={styles.person}><Avatar name={c.residentName} size={36} /><div><p className={styles.recordTitle}>{c.residentName}</p><p className={styles.metadata}>{c.invoiceRef} · {c.unitLabel}</p></div></div><div className={styles.reviewBalance}><span>{money(c.amountMinor)}</span><StatusPill status={riskLabel(c)} tone={debtorRisk(c).band} /></div><Button variant="ghost" aria-label={`Review collection case ${c.invoiceRef} for ${c.residentName}`} onClick={() => openCase(c)}>Review <ArrowUpRight size={15} aria-hidden="true" /></Button></li>)}</ul> : <EmptyState icon={<ShieldCheck size={22} />} title="No collection cases to review" description="Cases in your estate scope will appear here." />}
          </Card>
          <Card className={styles.panel}>
            <CardHeader title="Payment promises" subtitle="Recorded commitments, not confirmed payments" action={<StatusPill status={`${pendingPromises.length} pending`} tone="info" />} />
            {promiseCases.length ? <ul className={styles.promiseList}>{promiseCases.map((c) => <li key={c.id}><div className={styles.promiseHeading}><p className={styles.recordTitle}>{c.residentName}</p><StatusPill status={c.promiseStatus!} tone={PROMISE_TONE[c.promiseStatus!]} /></div><p className={styles.promiseAmount}>{money(c.promiseAmountMinor ?? 0)}<span className={styles.metadata}>{c.promiseDueISO ? <>Promised by <time dateTime={c.promiseDueISO}>{collectionDate(c.promiseDueISO)}</time></> : 'No promise date recorded'}</span></p><Button variant="ghost" aria-label={`View promise for ${c.residentName}, ${c.invoiceRef}`} onClick={() => openCase(c)}>View case <ArrowUpRight size={15} aria-hidden="true" /></Button></li>)}</ul> : <EmptyState icon={<HandCoins size={22} />} title="No payment promises recorded" description="A recorded promise and its status will appear here. It does not count as collected money." />}
          </Card>
        </div>
      </div> },
      { id: 'cases', label: 'Collection cases', content: <div className="pb-section">
        <Card padded={false} className={styles.panel}>
          <div className={styles.registerHeader}><CardHeader title="Collection case register" subtitle="Review arrears, current stages and payment commitments" action={<StatusPill status={`${cases.length} case${cases.length === 1 ? '' : 's'}`} tone="muted" />} />
            <div className={styles.toolbar}><label className={styles.search}><Search size={17} aria-hidden="true" /><span className="sr-only">Search collection cases</span><input type="search" placeholder="Search resident, unit or invoice…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.stageFilter}><span className="sr-only">Collection stage</span><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{DUNNING_LABEL[s]}</option>)}</select></label></div>
          </div>
          {filtered.length ? <div className="pb-table-scroll" role="region" aria-label="Collection case register" tabIndex={0}><table className={`pb-data-table ${styles.caseTable}`}>
            <thead><tr>{['Resident / unit', 'Invoice', 'Outstanding', 'Aging', 'Review signal', 'Current stage', 'Payment promise', 'Case'].map((heading) => <th key={heading} scope="col" className={heading === 'Outstanding' ? styles.numeric : undefined}>{heading}</th>)}</tr></thead>
            <tbody>{filtered.map((c) => <tr key={c.id}>
              <td><div className={styles.person}><Avatar name={c.residentName} size={32} /><div><span className={styles.recordTitle}>{c.residentName}</span><span className={styles.metadata}>{c.unitLabel}</span></div></div></td><td><span className={styles.recordTitle}>{c.invoiceRef}</span><span className={styles.metadata}>{c.remindersSent} reminder record{c.remindersSent === 1 ? '' : 's'}</span></td><td className={styles.numeric}>{money(c.amountMinor)}</td><td>{c.agingDays > 0 ? <span className="text-warning">{c.agingDays}d overdue</span> : <span className={styles.metadata}>Current</span>}</td><td><div className={styles.signal}><StatusPill status={riskLabel(c)} tone={debtorRisk(c).band} /><span className={styles.metadata}>Score {debtorRisk(c).score}/100</span></div></td><td><StatusPill status={DUNNING_LABEL[c.stage]} tone={STAGE_TONE[c.stage]} /></td><td>{c.promiseStatus ? <div className={styles.signal}><StatusPill status={c.promiseStatus} tone={PROMISE_TONE[c.promiseStatus]} /><span className={styles.metadata}>{money(c.promiseAmountMinor ?? 0)}{c.promiseDueISO ? ` · ${collectionDate(c.promiseDueISO)}` : ''}</span></div> : <span className={styles.metadata}>Not recorded</span>}</td><td className={styles.rowAction}><Button variant="ghost" aria-label={`Open collection case ${c.invoiceRef} for ${c.residentName}`} onClick={() => openCase(c)}>View <ArrowUpRight size={15} aria-hidden="true" /></Button></td>
            </tr>)}</tbody>
          </table></div> : <EmptyState icon={<HandCoins size={22} />} title={cases.length ? 'No matching collection cases' : 'No collection cases in your scope.'} description={cases.length ? 'Try another resident, unit, invoice reference or collection stage.' : 'Outstanding charges needing follow-up will appear here.'} action={cases.length ? <Button onClick={() => { setQuery(''); setStage('all'); }}>Clear filters</Button> : undefined} />}
          <p className={styles.registerFooter}>Showing {filtered.length} of {cases.length} recorded cases · NGN · Risk scores support human review only.</p>
        </Card>
        <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>Reminder records are not proof of delivery.<span>The current reminder action updates the recorded count only. SMS, email and WhatsApp delivery are not connected to this action.</span></p></div>
      </div> },
    ]} />

    {selected && <PortalDialog label={`Collection case ${selected.invoiceRef}`} drawer width={620} canClose={!pending} onClose={() => setSelectedId(null)}>
      <div className={styles.drawer}>
        <header className={styles.dialogHeader}><div className={styles.person}><Avatar name={selected.residentName} size={40} /><div><h2 className={styles.dialogTitle}>{selected.residentName}</h2><p className={styles.metadata}>{selected.unitLabel} · {selected.invoiceRef}</p></div></div><IconButton aria-label="Close collection case" disabled={pending} onClick={() => setSelectedId(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          {message && !followUp && !promiseFor && <CollectionFeedback message={message} onDismiss={() => setMessage(null)} />}
          <div className={styles.balancePanel}><span className={styles.metadata}>Recorded outstanding · NGN</span><span className={styles.balanceValue}>{money(selected.amountMinor)}</span><div className={styles.balanceContext}><StatusPill status={`${riskLabel(selected)} · ${debtorRisk(selected).score}/100`} tone={debtorRisk(selected).band} /><span className={styles.metadata}>{selected.agingDays > 0 ? `${selected.agingDays} days overdue` : 'Current balance'}</span></div></div>
          <section aria-label={`Collection stages for ${selected.residentName}`}><h3 className={styles.sectionTitle}>Collection workflow</h3><ol className={styles.stageList}>{STAGES.map((s, index) => <li key={s} className={styles.stageItem} data-current={s === selected.stage} aria-current={s === selected.stage ? 'step' : undefined}><span className={styles.stageNumber}>{index + 1}</span><span>{DUNNING_LABEL[s]}</span>{s === selected.stage && <span className={styles.currentLabel}>Current stage</span>}</li>)}</ol><p className={styles.footnote}>Workflow position is not evidence of previous message or notice delivery.</p></section>
          <section aria-label="Case follow-up record"><h3 className={styles.sectionTitle}>Follow-up record</h3><dl className={styles.facts}><div><dt>Invoice reference</dt><dd>{selected.invoiceRef}</dd></div><div><dt>Reminder entries</dt><dd>{selected.remindersSent}</dd></div><div><dt>Current stage</dt><dd>{DUNNING_LABEL[selected.stage]}</dd></div></dl></section>
          <section aria-label="Case payment promise"><div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>Payment promise</h3>{selected.promiseStatus && <StatusPill status={selected.promiseStatus} tone={PROMISE_TONE[selected.promiseStatus]} />}</div>{selected.promiseStatus ? <dl className={styles.facts}><div><dt>Promised amount</dt><dd>{money(selected.promiseAmountMinor ?? 0)}</dd></div><div><dt>Promised by</dt><dd>{selected.promiseDueISO ? <time dateTime={selected.promiseDueISO}>{collectionDate(selected.promiseDueISO)}</time> : 'Not recorded'}</dd></div></dl> : <p className={styles.bodySecondary}>No payment promise recorded for this case.</p>}<p className={styles.footnote}>A promise is a commitment, not a receipt or a reduction of the balance.</p></section>
          {canMutate ? <div className={styles.caseActions}><Button icon={<Bell size={16} />} disabled={pending} onClick={() => reviewFollowUp(selected, 'reminder')}>Record reminder</Button><Button icon={<HandCoins size={16} />} disabled={pending} onClick={() => { setMessage(null); setPromiseFor(selected); }}>Record promise</Button>{selected.stage !== 'escalated' && <Button variant="primary" icon={<ArrowRight size={16} />} disabled={pending} onClick={() => reviewFollowUp(selected, 'advance')}>Advance stage</Button>}</div> : <p className={styles.bodySecondary}>Read-only access. An authorised manager can update this case.</p>}
          <p className={styles.safetyNote}><ShieldCheck size={16} aria-hidden="true" />Advisory scores do not apply penalties or restrict resident services.</p>
        </div>
      </div>
    </PortalDialog>}

    {canMutate && promiseFor && <CollectionPromiseDialog c={promiseFor} onClose={() => setPromiseFor(null)} onDone={() => { setPromiseFor(null); setMessage('Payment promise recorded. No payment has been collected.'); router.refresh(); }} />}
    {canMutate && followUp && confirmationCase && <PortalDialog label={followUp.type === 'reminder' ? 'Record reminder entry' : 'Review collection stage change'} width={520} canClose={!pending} onClose={() => setFollowUp(null)}>
      <div className={styles.modal}>
        <header className={styles.dialogHeader}><div><h2 className={styles.dialogTitle}>{followUp.type === 'reminder' ? 'Record reminder entry' : 'Review stage change'}</h2><p className={styles.metadata}>{confirmationCase.residentName} · {confirmationCase.invoiceRef}</p></div><IconButton aria-label="Close collection confirmation" disabled={pending} onClick={() => setFollowUp(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          {message && <CollectionFeedback message={message} onDismiss={() => setMessage(null)} />}
          {followUp.type === 'reminder' ? <div className={styles.notice}><Bell size={18} aria-hidden="true" /><p>Record a reminder entry only.<span>This increases the case reminder count from {confirmationCase.remindersSent} to {confirmationCase.remindersSent + 1}. No message is sent and the outstanding balance does not change.</span></p></div> : <><div className={styles.stageChange}><StatusPill status={DUNNING_LABEL[confirmationCase.stage]} tone={STAGE_TONE[confirmationCase.stage]} /><ArrowRight size={18} aria-label="moves to" /><StatusPill status={DUNNING_LABEL[nextDunningStage(confirmationCase.stage)]} tone={STAGE_TONE[nextDunningStage(confirmationCase.stage)]} /></div><p className={styles.bodySecondary}>This changes the recorded workflow stage only. It does not send a notice, apply a penalty, collect money or restrict services.</p></>}
          <div className={styles.dialogActions}><Button disabled={pending} onClick={() => setFollowUp(null)}>Cancel</Button><Button variant="primary" disabled={pending || (followUp.type === 'advance' && confirmationCase.stage === 'escalated')} onClick={confirmFollowUp}>{pending ? 'Saving…' : followUp.type === 'reminder' ? 'Record entry' : 'Confirm stage change'}</Button></div>
        </div>
      </div>
    </PortalDialog>}
    {message && !selected && !followUp && !promiseFor && <CollectionFeedback floating message={message} onDismiss={() => setMessage(null)} />}
  </div>;
}

function CollectionFeedback({ message, onDismiss, floating = false }: { message: string; onDismiss: () => void; floating?: boolean }) {
  return <div className={floating ? styles.toast : styles.feedback} role="status"><Info size={18} aria-hidden="true" /><span>{message}</span><IconButton aria-label="Dismiss collection notification" onClick={onDismiss}><X size={18} /></IconButton></div>;
}

function RecoveryRing({ pct }: { pct: number }) {
  const percent = Math.max(0, Math.min(100, pct));
  return <div className={styles.ring} role="img" aria-label={`Estimated recovery: ${percent} percent of the recorded outstanding balance`}><svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="51" fill="none" stroke="var(--surface-3)" strokeWidth="10" /><circle cx="60" cy="60" r="51" fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${percent / 100 * 320.44} 320.44`} transform="rotate(-90 60 60)" /></svg><div className={styles.ringValue} aria-hidden="true"><span>{percent}%</span><span>Estimate</span></div></div>;
}
