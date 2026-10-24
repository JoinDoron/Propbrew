'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Percent, Trophy, UserPlus, Users, Wallet } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { inviteAgent } from '@/server/actions/shortlet';
import { ShortletDialog, ShortletFeedback, ShortletMetric, ShortletReview, shortletStyles } from './reference-ui';
import { shortletMoney } from './shortlet-format';
import styles from './shortlet-specialists-polish.module.css';

export type AgentRow = { id: string; name: string; phone: string; commissionPct: number; status: string; bookings: number; nights: number; revenueMinor: number; commissionMinor: number };

export function AgentsWorkspace({ agents, canCreate = false }: { agents: AgentRow[]; canCreate?: boolean }) {
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ranked = [...agents].sort((a, b) => b.revenueMinor - a.revenueMinor || a.name.localeCompare(b.name));
  const totalBookings = agents.reduce((sum, agent) => sum + agent.bookings, 0);
  const totalNights = agents.reduce((sum, agent) => sum + agent.nights, 0);
  const totalRevenue = agents.reduce((sum, agent) => sum + agent.revenueMinor, 0);
  const totalCommission = agents.reduce((sum, agent) => sum + agent.commissionMinor, 0);
  const maxRevenue = Math.max(...agents.map((agent) => agent.revenueMinor), 1);

  return <div className={styles.stack}>
    <Card><CardHeader title="Your agent network" subtitle="Recorded booking contribution and estimated commission · NGN" action={<Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setInviting(true)} disabled={!canCreate}>Invite agent</Button>} /><p className={styles.text}>Track agent bookings and estimated commission from recorded accommodation value. Invitations are records only; no message or payout is sent.</p></Card>
    <PageTabs label="Agent management" items={[
      { id: "agents", label: "Agents", content: <Card padded={false} className={styles.panel}><div className={styles.header}><CardHeader title="Agent leaderboard" subtitle="Ranked by recorded accommodation value · all agents in your current scope" action={<Trophy size={18} className="text-primary" />} /></div>{ranked.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Shortlet agent performance register"><table className={'pb-data-table ' + styles.table}><thead><tr>{['Rank', 'Agent', 'Status', 'Bookings / nights', 'Recorded value · NGN', 'Commission rate', 'Estimated commission · NGN'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{ranked.map((agent, index) => <tr key={agent.id}><td className={styles.rank}>{index + 1}</td><th scope="row"><div className={styles.identity}><Avatar name={agent.name} size={40} /><div><p className={styles.rowTitle}>{agent.name}</p><p className={styles.metadata}>{agent.phone || 'Phone not recorded'}</p></div></div></th><td><StatusPill status={agent.status.replaceAll('_', ' ')} tone={agent.status === 'invited' ? 'warn' : agent.status === 'active' ? 'success' : 'neutral'} /></td><td><p className={styles.text}>{agent.bookings} bookings</p><p className={styles.metadata}>{agent.nights} nights</p></td><td className={styles.numeric}><p className={styles.rowTitle}>{shortletMoney(agent.revenueMinor)}</p><progress max={maxRevenue} value={Math.max(0, agent.revenueMinor)} className={styles.progress + ' mt-3'} aria-label={agent.name + ' recorded value relative to the leading agent'} /></td><td className={styles.numeric}>{agent.commissionPct}%</td><td className={styles.numeric}>{shortletMoney(agent.commissionMinor)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<Users size={26} />} title="No agents recorded" description="Record an agent invitation when the responsible operator has confirmed the agent details and commission rate." /></div>}<p className={styles.footer}>Showing all {ranked.length} agents. Estimated commission is a planning calculation, not an approved payable, bank transfer or marketplace payout.</p></Card> },
      { id: "performance", label: "Performance", content: <div className={styles.stack}><div className={shortletStyles.metrics}><ShortletMetric label="Agents" value={String(agents.length)} icon={<Users size={18} />} /><ShortletMetric label="Agent bookings" value={String(totalBookings)} icon={<CalendarCheck size={18} />} /><ShortletMetric label="Recorded value · NGN" value={shortletMoney(totalRevenue)} icon={<Wallet size={18} />} /><ShortletMetric label="Estimated commission · NGN" value={shortletMoney(totalCommission)} icon={<Percent size={18} />} /></div><Card><CardHeader title="Contribution and commission" subtitle="Keep accommodation value, recorded contribution and payout approval separate" /><dl className={styles.facts}><div><dt>Recorded bookings</dt><dd>{totalBookings}</dd></div><div><dt>Recorded nights</dt><dd>{totalNights}</dd></div><div><dt>Accommodation value · NGN</dt><dd>{shortletMoney(totalRevenue)}</dd></div><div><dt>Estimated commission · NGN</dt><dd>{shortletMoney(totalCommission)}</dd></div></dl><p className={styles.metadata + ' mt-6'}>Commission estimates use each agent’s recorded rate and the booking values supplied to this view. Payment verification and finance approval are separate processes; no money moves here.</p></Card></div> },
    ]} />
    {inviting ? <InviteDialog onClose={() => setInviting(false)} onDone={(name) => { setInviting(false); setMessage('Invitation record created for ' + name + '. No message was sent.'); }} /> : null}
    {message ? <ShortletFeedback message={message} onClose={() => setMessage(null)} /> : null}
  </div>;
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [percent, setPercent] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim() !== '' && percent.trim() !== '' && Number.isInteger(Number(percent)) && Number(percent) >= 0 && Number(percent) <= 30;
  function submit() {
    if (pending || inFlight.current || !valid) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await inviteAgent({ name, phone, commissionPct: Number(percent) });
        if (!result.ok) { setError(result.error); return; }
        router.refresh();
        onDone(name);
      } catch { setError('The invitation record could not be confirmed. Your entries are still here; refresh before trying again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <ShortletDialog title="Invite agent" onClose={onClose} pending={pending} wide><form className={styles.form} onSubmit={(event) => event.preventDefault()}><p className={styles.text}>Add the agreed agent details to this workspace. This does not provision an account, send a WhatsApp invitation or initiate a commission payout.</p><label className={styles.field}>Agent or agency name<input required aria-label="Name" disabled={pending} value={name} onChange={(event) => setName(event.target.value)} className="pb-form-control" placeholder="Agent or agency" autoFocus /></label><div className={styles.formGrid}><label className={styles.field}>Phone (WhatsApp)<input aria-label="Phone (WhatsApp)" type="tel" autoComplete="tel" disabled={pending} value={phone} onChange={(event) => setPhone(event.target.value)} className="pb-form-control" placeholder="+234…" /></label><label className={styles.field}>Commission (%)<input aria-label="Commission (%)" required type="number" min={0} max={30} step={1} inputMode="numeric" disabled={pending} value={percent} onChange={(event) => setPercent(event.target.value)} className="pb-form-control" /></label></div><p className={styles.metadata}>Record the agreed commission between 0% and 30%. A workspace rate is not a signed agency agreement or payout approval.</p>{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<ShortletReview pending={pending} disabled={!valid} onCancel={onClose} onSubmit={submit} label="Confirm record invite">Review the name, phone number and commission above. This records a workspace change only; messages, bank transfers and gateway refunds are not sent by this form.</ShortletReview></form></ShortletDialog>;
}
