'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Trophy, Star, Gift, Crown, CalendarCheck, Vote, Coins, Search, X, Info } from 'lucide-react';
import { PageTabs } from '@/components/ui/page-tabs';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { tierFor, tierProgress, TIER_TONE, TIER_MIN, EARN_POINTS, type RewardTier, type EarnReason } from '@/domain/estate';
import { awardPoints, redeemPerk } from '@/server/actions/estate';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './experience-workspaces.module.css';

export type MemberRow = { id: string; residentName: string; unitLabel: string; points: number; onTimeStreak: number; eventsAttended: number; pollsVoted: number };
export type PerkRow = { id: string; title: string; detail: string; cost: number; category: string; stock: number };
const TIER_LABEL: Record<RewardTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
const REASONS: { reason: EarnReason; label: string; icon: React.ReactNode }[] = [
  { reason: 'on_time_payment', label: 'On-time payment', icon: <CalendarCheck size={16} /> },
  { reason: 'event', label: 'Event attendance', icon: <CalendarCheck size={16} /> },
  { reason: 'poll', label: 'Poll participation', icon: <Vote size={16} /> },
];
const pts = (n: number) => n.toLocaleString('en-NG');
type Review = { member: MemberRow; reason: EarnReason } | { member: MemberRow; perk: PerkRow };

export function RewardsWorkspace({ members, perks, kpis, canMutate = false }: {
  members: MemberRow[]; perks: PerkRow[]; canMutate?: boolean;
  kpis: { members: number; pointsIssued: number; goldPlus: number; perks: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ranked = [...members].sort((a, b) => b.points - a.points);
  const [selected, setSelected] = useState(ranked[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sel = members.find((m) => m.id === selected);
  const visible = ranked.filter((m) => `${m.residentName} ${m.unitLabel}`.toLowerCase().includes(query.trim().toLowerCase()));
  function openReview(value: Review) { setError(null); setReview(value); }
  function confirm() {
    if (!canMutate || pending || !review) return;
    setError(null);
    start(async () => {
      try {
        const r = 'reason' in review ? await awardPoints(review.member.id, review.reason) : await redeemPerk(review.member.id, review.perk.id);
        if (!r.ok) { setError(r.error ?? 'The reward could not be updated.'); return; }
        setFeedback('reason' in review ? `${pts(EARN_POINTS[review.reason])} points awarded to ${review.member.residentName}.` : `${review.perk.title} redeemed for ${review.member.residentName}.`);
        setReview(null); router.refresh();
      } catch { setError('The reward could not be updated. Please try again.'); }
    });
  }
  return <div className={layout.layout}>
    <div className={layout.context}><p className={layout.body}>Recognise participation, review point balances and manage the perks programme.</p><StatusPill status={canMutate ? 'Manager access' : 'Read-only access'} tone={canMutate ? 'info' : 'neutral'} /></div>
    {feedback && <div role="status" className={`${layout.feedback} ${styles.feedback}`}><span>{feedback}</span><IconButton aria-label="Dismiss reward update" onClick={() => setFeedback(null)}><X size={16} /></IconButton></div>}
    <PageTabs label="Rewards sections" items={[
      { id: 'members', label: 'Members', content: <div className={layout.layout}>
        <Card padded={false}>
          <div className={layout.registerHeader}><CardHeader title="Member leaderboard" subtitle="Select a member to review their balance or redeem a perk." action={<Trophy size={20} className="text-primary" />} />
            <div className={layout.toolbar}><label className={layout.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search reward members" placeholder="Search by resident or unit" value={query} onChange={(e) => setQuery(e.target.value)} /></label><span className={layout.metadata}>Showing {visible.length} of {members.length} members</span></div>
          </div>
          {visible.length ? <div className="pb-table-scroll" role="region" aria-label="Reward member leaderboard" tabIndex={0}><table className={`pb-data-table ${layout.table} ${styles.rewardTable}`}>
            <thead><tr>{['Rank', 'Member', 'Tier', 'Participation', 'Points', 'Next tier', 'Selection'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{visible.map((m) => { const tier = tierFor(m.points); const progress = tierProgress(m.points); return <tr key={m.id} className={m.id === selected ? styles.selected : undefined}>
              <td className={styles.rank}>#{ranked.findIndex((r) => r.id === m.id) + 1}</td>
              <td><div className={layout.person}><Avatar name={m.residentName} size={36} /><div><div className={layout.title}>{m.residentName}</div><div className={layout.metadata}>{m.unitLabel}</div></div></div></td>
              <td><StatusPill status={TIER_LABEL[tier]} tone={TIER_TONE[tier]} /></td>
              <td><div className={layout.body}>{m.onTimeStreak} month payment streak</div><div className={layout.metadata}>{m.eventsAttended} events · {m.pollsVoted} polls</div></td>
              <td className={styles.numeric}>{pts(m.points)} pts</td>
              <td className={styles.memberProgress}><div className={layout.metadata}>{progress.next ? `${pts(progress.toNext)} to ${TIER_LABEL[progress.next]}` : 'Highest tier reached'}</div>{progress.next && <div className={styles.progress} role="progressbar" aria-label={`${m.residentName} progress to ${TIER_LABEL[progress.next]}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct}><span style={{ width: `${progress.pct}%` }} /></div>}</td>
              <td><Button type="button" variant={m.id === selected ? 'primary' : 'secondary'} aria-pressed={m.id === selected} aria-label={`Select reward member ${m.residentName}`} onClick={() => setSelected(m.id)}>{m.id === selected ? 'Selected' : 'Select'}</Button></td>
            </tr>; })}</tbody>
          </table></div> : <EmptyState icon={<Award size={24} />} title={members.length ? 'No matching members' : 'No reward members yet'} description={members.length ? 'Try a different resident name or unit.' : 'Reward members in your scope will appear here.'} />}
          {sel && <div className={styles.selection}><div><div className={layout.title}>{sel.residentName}</div><div className={layout.metadata}>{pts(sel.points)} points available · {sel.unitLabel}</div></div>{canMutate ? <div className={styles.actionRow}>{REASONS.map((r) => <Button key={r.reason} disabled={pending} icon={r.icon} onClick={() => openReview({ member: sel, reason: r.reason })}>{r.label} +{EARN_POINTS[r.reason]}</Button>)}</div> : <span className={layout.metadata}>Read-only access · awards require manager permission.</span>}</div>}
        </Card>
      </div> },
      { id: 'perks', label: 'Perks', content: <div className={layout.layout}>
        <div className={layout.notice}><Gift size={18} aria-hidden="true" /><div><p className={layout.title}>{sel ? `Perks for ${sel.residentName}` : 'Choose a member first'}</p><p className={layout.body}>{sel ? `${pts(sel.points)} points available. Review the cost before confirming a redemption.` : 'Select a resident in Members before redeeming a perk.'}</p></div></div>
        {perks.length ? <div className={styles.catalog}>{perks.map((p) => { const affordable = !!sel && sel.points >= p.cost && p.stock > 0; return <Card key={p.id} className={styles.perk}><div className={styles.perkHeader}><span className={styles.softIcon}><Gift size={20} /></span><div><h3 className={styles.sectionTitle}>{p.title}</h3><p className={layout.metadata}>{p.category}</p></div><div className="ml-auto"><StatusPill status={p.stock > 0 ? `${p.stock} available` : 'Out of stock'} tone={p.stock > 0 ? 'success' : 'neutral'} /></div></div><p className={layout.body}>{p.detail}</p><div className={styles.context}><span className={styles.points}>{pts(p.cost)} <span className={layout.metadata}>points</span></span>{canMutate ? <Button variant="primary" disabled={pending || !affordable} onClick={() => sel && openReview({ member: sel, perk: p })} aria-label={`Review redemption of ${p.title}`}>{p.stock <= 0 ? 'Out of stock' : !sel ? 'Select a member' : sel.points < p.cost ? 'More points needed' : 'Redeem perk'}</Button> : <span className={layout.metadata}>Read-only access</span>}</div></Card>; })}</div> : <Card><EmptyState icon={<Gift size={24} />} title="No perks available" description="Perks in your scope will appear here when the programme is configured." /></Card>}
      </div> },
      { id: 'overview', label: 'Rewards overview', content: <div className={layout.layout}>
        <div className={layout.metrics}><KpiCard label="Members" value={pts(kpis.members)} icon={<Star size={18} />} /><KpiCard label="Current point balances" value={pts(kpis.pointsIssued)} icon={<Coins size={18} />} /><KpiCard label="Gold & above" value={pts(kpis.goldPlus)} icon={<Crown size={18} />} /><KpiCard label="Perk types" value={pts(kpis.perks)} icon={<Gift size={18} />} /></div>
        <Card><CardHeader title="Reward tiers" subtitle="Tiers reflect each member’s current balance, not lifetime earnings." /><div className={styles.tierGrid}>{(Object.keys(TIER_LABEL) as RewardTier[]).map((tier) => <div key={tier} className={styles.tierItem}><StatusPill status={TIER_LABEL[tier]} tone={TIER_TONE[tier]} /><div className={styles.points}>{pts(TIER_MIN[tier])}</div><span className={layout.metadata}>points to qualify</span></div>)}</div></Card>
        <div className={layout.notice}><Info size={18} aria-hidden="true" /><p className={layout.body}>Point balances are reward units, not cash. Awards and redemptions require a manager’s confirmation; no award is generated automatically.</p></div>
      </div> },
    ]} />
    {canMutate && review && <PortalDialog label={'reason' in review ? 'Confirm reward points' : 'Confirm perk redemption'} onClose={() => setReview(null)} canClose={!pending} width={520}><div className={layout.modal}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{'reason' in review ? 'Confirm reward points' : 'Confirm perk redemption'}</h2><IconButton aria-label="Close reward confirmation" onClick={() => setReview(null)} disabled={pending}><X size={18} /></IconButton></div><div className={layout.dialogBody}>
      <p className={layout.body}>{'reason' in review ? `Confirm the ${REASONS.find((r) => r.reason === review.reason)?.label.toLowerCase()} has been verified before awarding points.` : `Redeeming ${review.perk.title} will deduct points and reduce the available stock.`}</p>
      <dl className={styles.facts}><div><dt>Member</dt><dd>{review.member.residentName}</dd></div><div><dt>Current balance</dt><dd>{pts(review.member.points)} points</dd></div><div><dt>{'reason' in review ? 'Points to award' : 'Redemption cost'}</dt><dd>{pts('reason' in review ? EARN_POINTS[review.reason] : review.perk.cost)} points</dd></div><div><dt>Balance after confirmation</dt><dd>{pts(review.member.points + ('reason' in review ? EARN_POINTS[review.reason] : -review.perk.cost))} points</dd></div></dl>
      {error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button onClick={() => setReview(null)} disabled={pending}>Cancel</Button><Button variant="primary" disabled={pending} onClick={confirm}>{pending ? 'Saving…' : 'reason' in review ? 'Confirm award' : 'Confirm redemption'}</Button></div>
    </div></div></PortalDialog>}
  </div>;
}
