'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, CalendarClock, Home, Info, KeyRound, LogIn, Search, ShieldCheck, Wallet, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { TENANCY_FLOW, TENANCY_LABEL, tenancyStageTone, leaseRunwayDays, nextTenancyStage, type DepositStatus } from '@/domain/estate';
import { advanceTenancy } from '@/server/actions/estate';
import { TenancyDepositDialog } from './tenancy-deposit-dialog';
import { tenancyMoney as money, tenancyDate, canRecordDeposit, DEPOSIT_LABEL, DEPOSIT_TONE, type TenancyRow } from './tenancy-types';
import styles from './tenancy-workspace.module.css';

export type { TenancyRow } from './tenancy-types';
const DEPOSIT_STATUSES: DepositStatus[] = ['pending', 'held', 'partially_refunded', 'refunded', 'withheld'];
const compactMoney = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
function runway(t: TenancyRow, nowMs: number) {
  const days = leaseRunwayDays(t, nowMs);
  return days !== null && Number.isFinite(days) ? days : null;
}
function runwayLabel(days: number) {
  return days < 0 ? `Expired ${-days}d ago` : days === 0 ? 'Due at snapshot' : `${days}d remaining`;
}

export function TenancyWorkspace({ tenancies, kpis, nowMs, canMutate }: {
  tenancies: TenancyRow[];
  kpis: { active: number; inMotion: number; renewalsSoon: number; depositExposureMinor: number };
  nowMs: number;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advanceFor, setAdvanceFor] = useState<string | null>(null);
  const [settleFor, setSettleFor] = useState<TenancyRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');

  const sorted = [...tenancies].sort((a, b) => TENANCY_FLOW.indexOf(a.stage) - TENANCY_FLOW.indexOf(b.stage) || a.residentName.localeCompare(b.residentName));
  const filtered = sorted.filter((t) => (stage === 'all' || t.stage === stage) && `${t.residentName} ${t.unitLabel}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = tenancies.find((t) => t.id === selectedId) ?? null;
  const advancing = tenancies.find((t) => t.id === advanceFor) ?? null;
  const renewalQueue = tenancies.filter((t) => t.stage === 'active' && runway(t, nowMs) !== null && runway(t, nowMs)! <= 45).sort((a, b) => runway(a, nowMs)! - runway(b, nowMs)!);
  const pendingDepositMinor = tenancies.filter((t) => t.depositStatus === 'pending').reduce((total, t) => total + t.depositMinor, 0);
  const heldDepositMinor = tenancies.filter((t) => t.depositStatus === 'held').reduce((total, t) => total + t.depositMinor, 0);
  const snapshotISO = Number.isFinite(nowMs) ? new Date(nowMs).toISOString().slice(0, 10) : '';
  const openTenancy = (t: TenancyRow) => { setMessage(null); setSelectedId(t.id); };

  function confirmAdvance() {
    if (!canMutate || pending || !advancing || advancing.stage === 'closed') return;
    const t = advancing;
    start(async () => {
      try {
        const result = await advanceTenancy(t.id);
        if (!result.ok) { setMessage(result.error); return; }
        setAdvanceFor(null);
        setMessage(`Tenancy stage recorded as ${TENANCY_LABEL[nextTenancyStage(t.stage)]}.`);
        router.refresh();
      } catch { setMessage('Unable to update this tenancy. Please try again.'); }
    });
  }

  return <div className="pb-section">
    <div className={styles.context}><p className={styles.metadata}>{tenancies.length} recorded tenanc{tenancies.length === 1 ? 'y' : 'ies'} · NGN (₦) · Snapshot {snapshotISO ? <time dateTime={snapshotISO}>{tenancyDate(snapshotISO)}</time> : 'date unavailable'}</p><StatusPill status={canMutate ? 'Manager access' : 'Read-only access'} tone="info" /></div>
    <PageTabs label="Tenancy sections" items={[
      { id: 'tenancies', label: 'Tenancies', content: <div className="pb-section">
        <Card padded={false} className={styles.panel}>
          <div className={styles.registerHeader}><CardHeader title="Tenancy register" subtitle="Residents, lease dates, lifecycle stages and deposit records" action={<StatusPill status={`${tenancies.length} record${tenancies.length === 1 ? '' : 's'}`} tone="muted" />} />
            <div className={styles.toolbar}><label className={styles.search}><Search size={17} aria-hidden="true" /><span className="sr-only">Search tenancies</span><input type="search" placeholder="Search resident or unit…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.stageFilter}><span className="sr-only">Tenancy stage</span><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{TENANCY_FLOW.map((s) => <option key={s} value={s}>{TENANCY_LABEL[s]}</option>)}</select></label></div>
          </div>
          {filtered.length ? <div className="pb-table-scroll" role="region" aria-label="Tenancy register" tabIndex={0}><table className={`pb-data-table ${styles.tenancyTable}`}>
            <thead><tr>{['Resident / unit', 'Annual rent', 'Current stage', 'Lease end', 'Recorded deposit', 'Record'].map((heading) => <th key={heading} scope="col" className={heading === 'Annual rent' ? styles.numeric : undefined}>{heading}</th>)}</tr></thead>
            <tbody>{filtered.map((t) => {
              const days = runway(t, nowMs);
              return <tr key={t.id}>
                <td><div className={styles.person}><Avatar name={t.residentName} size={32} /><div><span className={styles.recordTitle}>{t.residentName}</span><span className={styles.metadata}>{t.unitLabel}</span></div></div></td>
                <td className={styles.numeric}>{money(t.rentMinor)}</td><td><StatusPill status={TENANCY_LABEL[t.stage]} tone={tenancyStageTone(t.stage)} /></td>
                <td>{t.leaseEndISO ? <div className={styles.signal}><time dateTime={t.leaseEndISO}>{tenancyDate(t.leaseEndISO)}</time>{t.stage === 'active' && days !== null && <span className={days <= 45 ? styles.renewalWarning : styles.metadata}>{runwayLabel(days)}</span>}</div> : <span className={styles.metadata}>Not recorded</span>}</td>
                <td><div className={styles.signal}><span className={styles.recordTitle}>{money(t.depositMinor)}</span><StatusPill status={DEPOSIT_LABEL[t.depositStatus]} tone={DEPOSIT_TONE[t.depositStatus]} /></div></td>
                <td className={styles.rowAction}><Button variant="ghost" aria-label={`View tenancy for ${t.residentName}, ${t.unitLabel}`} onClick={() => openTenancy(t)}>View <ArrowUpRight size={15} aria-hidden="true" /></Button></td>
              </tr>;
            })}</tbody>
          </table></div> : <EmptyState icon={<Home size={22} />} title={tenancies.length ? 'No matching tenancies' : 'No tenancy records in your scope yet.'} description={tenancies.length ? 'Try another resident, unit or lifecycle stage.' : 'Register a property and tenant from Estate overview to begin building your estate records.'} action={tenancies.length ? <Button onClick={() => { setQuery(''); setStage('all'); }}>Clear filters</Button> : undefined} />}
          <p className={styles.registerFooter}>Showing {filtered.length} of {tenancies.length} recorded tenancies · Lease runway uses the snapshot date, not today.</p>
        </Card>
        <div className={styles.notice}><ShieldCheck size={18} aria-hidden="true" /><p>Every transition stays under human review.<span>Changing a stage updates the record. It does not automatically renew a lease, send notice or make a payment.</span></p></div>
      </div> },

      { id: 'overview', label: 'Lease overview', content: <div className="pb-section">
        <div className={styles.metrics}>
          <KpiCard label="Active tenancies" value={String(kpis.active)} icon={<Home size={18} />} />
          <KpiCard label="Moving in / out" value={String(kpis.inMotion)} icon={<LogIn size={18} />} />
          <KpiCard label="Renewal review ≤45d" value={String(kpis.renewalsSoon)} icon={<CalendarClock size={18} />} />
          <KpiCard label="Deposit exposure" value={compactMoney(kpis.depositExposureMinor)} icon={<Wallet size={18} />} />
        </div>
        <div className={styles.analytics}>
          <Card className={styles.panel}><CardHeader title="Lifecycle snapshot" subtitle="Current stages across the recorded tenancies" /><dl className={styles.stageGrid}>{TENANCY_FLOW.map((s) => <div key={s}><dt><StatusPill status={TENANCY_LABEL[s]} tone={tenancyStageTone(s)} /></dt><dd>{tenancies.filter((t) => t.stage === s).length}<span className={styles.metadata}>tenanc{tenancies.filter((t) => t.stage === s).length === 1 ? 'y' : 'ies'}</span></dd></div>)}</dl><p className={styles.footnote}>Stage counts include closed records. They show current position, not a completed screening or signed agreement.</p></Card>
          <Card className={styles.panel}><CardHeader title="Renewal review" subtitle="Active leases ending within 45 days, including expired leases" action={<StatusPill status={`${renewalQueue.length} to review`} tone={renewalQueue.length ? 'warn' : 'muted'} />} />
            {renewalQueue.length ? <ul className={styles.renewalList}>{renewalQueue.map((t) => <li key={t.id}><div className={styles.person}><Avatar name={t.residentName} size={36} /><div><p className={styles.recordTitle}>{t.residentName}</p><p className={styles.metadata}>{t.unitLabel}</p></div></div><div className={styles.renewalDetail}><span className={styles.renewalWarning}>{runwayLabel(runway(t, nowMs)!)}</span><time dateTime={t.leaseEndISO} className={styles.metadata}>{tenancyDate(t.leaseEndISO!)}</time></div><Button variant="ghost" aria-label={`Review lease for ${t.residentName}`} onClick={() => openTenancy(t)}>Review <ArrowUpRight size={15} aria-hidden="true" /></Button></li>)}</ul> : <EmptyState icon={<CalendarClock size={22} />} title="No renewals needing review" description="No recorded active lease is due within 45 days of the snapshot. Missing lease-end dates are not counted." />}
            <p className={styles.footnote}>Review lease terms and the resident’s agreed dates. No renewal or notice is generated automatically.</p>
          </Card>
        </div>
        <Card className={styles.panel}>
          <CardHeader title="Deposit records" subtitle="Exposure includes deposits due and deposits marked as held" action={<Wallet size={18} className="text-primary" />} />
          <dl className={styles.depositAmounts}><div><dt>Due</dt><dd>{money(pendingDepositMinor)}</dd></div><div><dt>Marked as held</dt><dd>{money(heldDepositMinor)}</dd></div><div><dt>Due + held exposure</dt><dd>{money(kpis.depositExposureMinor)}</dd></div></dl>
          <dl className={styles.depositStatuses}>{DEPOSIT_STATUSES.map((s) => <div key={s}><dt><StatusPill status={DEPOSIT_LABEL[s]} tone={DEPOSIT_TONE[s]} /></dt><dd>{tenancies.filter((t) => t.depositStatus === s).length}<span className={styles.metadata}>record{tenancies.filter((t) => t.depositStatus === s).length === 1 ? '' : 's'}</span></dd></div>)}</dl>
          <p className={styles.footnote}>These are recorded amounts and status flags, not proof of cash held or a completed refund. Settlement currently records status only; it does not transfer money.</p>
        </Card>
      </div> },
    ]} />

    {selected && <PortalDialog label={`Tenancy record for ${selected.residentName}`} drawer width={620} canClose={!pending} onClose={() => setSelectedId(null)}>
      <div className={styles.drawer}><header className={styles.dialogHeader}><div className={styles.person}><Avatar name={selected.residentName} size={40} /><div><h2 className={styles.dialogTitle}>{selected.residentName}</h2><p className={styles.metadata}>{selected.unitLabel}</p></div></div><IconButton aria-label="Close tenancy record" disabled={pending} onClick={() => setSelectedId(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          {message && !advanceFor && !settleFor && <TenancyFeedback message={message} onDismiss={() => setMessage(null)} />}
          <div className={styles.identitySummary}><StatusPill status={TENANCY_LABEL[selected.stage]} tone={tenancyStageTone(selected.stage)} /><span className={styles.metadata}>Annual rent · NGN</span><span className={styles.rentValue}>{money(selected.rentMinor)}</span></div>
          <section aria-label="Lease dates"><h3 className={styles.sectionTitle}>Lease dates</h3><dl className={styles.facts}>{[['Applied', selected.applicationISO], ['Move-in date', selected.moveInISO], ['Lease end', selected.leaseEndISO], ['Move-out date', selected.moveOutISO]].map(([label, date]) => <div key={label}><dt>{label}</dt><dd>{date ? <time dateTime={date}>{tenancyDate(date)}</time> : 'Not recorded'}</dd></div>)}</dl>{selected.stage === 'active' && runway(selected, nowMs) !== null && <p className={styles.leaseNote}><CalendarClock size={16} aria-hidden="true" /><span>{runwayLabel(runway(selected, nowMs)!)} · As of {snapshotISO ? tenancyDate(snapshotISO) : 'snapshot'}</span></p>}</section>
          <section aria-label="Tenancy lifecycle"><h3 className={styles.sectionTitle}>Tenancy lifecycle</h3><ol className={styles.lifecycleList}>{TENANCY_FLOW.map((s, index) => <li key={s} className={styles.lifecycleItem} data-current={s === selected.stage} aria-current={s === selected.stage ? 'step' : undefined}><span className={styles.stageNumber}>{index + 1}</span><span>{TENANCY_LABEL[s]}</span>{s === selected.stage && <span className={styles.currentLabel}>Current stage</span>}</li>)}</ol></section>
          <section aria-label="Deposit record"><div className={styles.sectionHeader}><h3 className={styles.sectionTitle}>Deposit record</h3><StatusPill status={DEPOSIT_LABEL[selected.depositStatus]} tone={DEPOSIT_TONE[selected.depositStatus]} /></div><div className={styles.depositPanel}><span className={styles.metadata}>Recorded deposit amount</span><span className={styles.depositValue}>{money(selected.depositMinor)}</span></div><p className={styles.footnote}>A status flag is not proof of receipt or payment. Actual refund amounts and payment evidence are not stored in this record.</p></section>
          {canMutate ? <div className={styles.recordActions}>{selected.stage !== 'closed' && <Button variant="primary" icon={<ArrowRight size={16} />} disabled={pending} onClick={() => { setMessage(null); setAdvanceFor(selected.id); }}>Review next stage</Button>}{canRecordDeposit(selected) && <Button icon={<KeyRound size={16} />} disabled={pending} onClick={() => { setMessage(null); setSettleFor(selected); }}>Record deposit settlement</Button>}{selected.stage === 'closed' && !canRecordDeposit(selected) && <p className={styles.metadata}>This tenancy is closed. No further lifecycle action is available.</p>}</div> : <p className={styles.bodySecondary}>Read-only access. An authorised operator can update this tenancy.</p>}
          <p className={styles.safetyNote}><ShieldCheck size={16} aria-hidden="true" />Lifecycle changes require human review. No automated housing decisions.</p>
        </div>
      </div>
    </PortalDialog>}

    {canMutate && settleFor && canRecordDeposit(settleFor) && <TenancyDepositDialog t={settleFor} onClose={() => setSettleFor(null)} onDone={() => { setSettleFor(null); setMessage('Deposit status recorded. No money was transferred.'); router.refresh(); }} />}
    {canMutate && advancing && <PortalDialog label="Review tenancy stage change" width={540} canClose={!pending} onClose={() => setAdvanceFor(null)}>
      <div className={styles.modal}><header className={styles.dialogHeader}><div><h2 className={styles.dialogTitle}>Review tenancy stage change</h2><p className={styles.metadata}>{advancing.residentName} · {advancing.unitLabel}</p></div><IconButton aria-label="Close tenancy confirmation" disabled={pending} onClick={() => setAdvanceFor(null)}><X size={18} /></IconButton></header>
        <div className={styles.dialogBody}>
          {message && <TenancyFeedback message={message} onDismiss={() => setMessage(null)} />}
          <div className={styles.stageChange}><StatusPill status={TENANCY_LABEL[advancing.stage]} tone={tenancyStageTone(advancing.stage)} /><ArrowRight size={18} aria-label="moves to" /><StatusPill status={TENANCY_LABEL[nextTenancyStage(advancing.stage)]} tone={tenancyStageTone(nextTenancyStage(advancing.stage))} /></div>
          <p className={styles.bodySecondary}>Check the lease, agreed dates and supporting records before saving. This changes the recorded lifecycle stage, not the lease contract or payment ledger.</p>
          {nextTenancyStage(advancing.stage) === 'moving_in' && advancing.depositStatus === 'pending' && <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>The pending deposit will be marked as held.<span>The current workflow changes this flag automatically at Moving in. Verify the deposit receipt before continuing.</span></p></div>}
          {nextTenancyStage(advancing.stage) === 'active' && !advancing.moveInISO && <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>A move-in date will be recorded.<span>The current workflow uses the workspace reference date{snapshotISO ? ` (${tenancyDate(snapshotISO)})` : ''}, not a newly entered move-in date.</span></p></div>}
          <div className={styles.dialogActions}><Button disabled={pending} onClick={() => setAdvanceFor(null)}>Cancel</Button><Button variant="primary" disabled={pending || advancing.stage === 'closed'} onClick={confirmAdvance}>{pending ? 'Saving…' : 'Confirm stage change'}</Button></div>
        </div>
      </div>
    </PortalDialog>}
    {message && !selected && !advanceFor && !settleFor && <TenancyFeedback floating message={message} onDismiss={() => setMessage(null)} />}
  </div>;
}

function TenancyFeedback({ message, onDismiss, floating = false }: { message: string; onDismiss: () => void; floating?: boolean }) {
  return <div className={floating ? styles.toast : styles.feedback} role="status"><Info size={18} aria-hidden="true" /><span>{message}</span><IconButton aria-label="Dismiss tenancy notification" onClick={onDismiss}><X size={18} /></IconButton></div>;
}
