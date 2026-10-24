'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, Heart, MessageCircle, Sparkles, TriangleAlert, UserMinus, Users } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { toneVar, type Tone } from '@/lib/status-tones';
import type { Sentiment } from '@/domain/estate';
import { acknowledgeFeedback, resolveComplaint } from '@/server/actions/estate';
import styles from './community-pulse.module.css';

export type Health = { score: number; band: Tone; label: string };
export type FeedbackRow = { id: string; residentName: string; unitLabel: string; channel: string; sentiment: Sentiment; topic: string; text: string; atISO: string; acknowledged: boolean };
export type ComplaintRow = { id: string; building: string; category: string; severity: string; status: string; atISO: string };
export type Hotspot = { building: string; open: number; high: number };
export type AtRisk = { name: string; unitLabel: string; score: number; band: Tone; note: string };
export type Engagement = { appAdoptionPct: number; eventAttendancePct: number; pollParticipationPct: number; announcementReadPct: number; activeResidents: number; totalResidents: number };

const SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative'];
const SENT_TONE: Record<Sentiment, Tone> = { positive: 'success', neutral: 'neutral', negative: 'danger' };
const SEV_TONE: Record<string, Tone> = { high: 'danger', medium: 'warn', low: 'info' };
const percent = (value: number) => Math.min(100, Math.max(0, value));

function ago(iso: string, nowMs: number) {
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function CommunityPulse({ health, nps, sentiment, engagement, feedback, complaints, hotspots, atRisk, nowMs }: {
  health: Health; nps: number; sentiment: Record<Sentiment, number>; engagement: Engagement;
  feedback: FeedbackRow[]; complaints: ComplaintRow[]; hotspots: Hotspot[]; atRisk: AtRisk[]; nowMs: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 4000);
    return () => clearInterval(timer);
  }, []);
  const clockMs = nowMs + tick * 4000;
  const flash = (message: string) => { setToast(message); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => {
    try {
      const result = await fn();
      if (result.ok) { router.refresh(); flash(success); }
      else flash(result.error ?? 'Unable to save. Please try again.');
    } catch { flash('Unable to save. Please try again.'); }
  });

  const totalSent = sentiment.positive + sentiment.neutral + sentiment.negative;
  const sentimentDivisor = totalSent || 1;
  const openComplaints = complaints.filter((complaint) => complaint.status === 'open');
  const pendingFeedback = feedback.filter((row) => !row.acknowledged).length;
  const highRiskCount = atRisk.filter((row) => row.band === 'danger').length;
  const maxOpen = Math.max(1, ...hotspots.map((hotspot) => hotspot.open));
  const bars = [
    { label: 'App adoption', pct: engagement.appAdoptionPct },
    { label: 'Announcement reads', pct: engagement.announcementReadPct },
    { label: 'Event attendance', pct: engagement.eventAttendancePct },
    { label: 'Poll participation', pct: engagement.pollParticipationPct },
  ];
  const shownFeedback = [...feedback].sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || Date.parse(b.atISO) - Date.parse(a.atISO));

  return (
    <div className="pb-section">
      <PageTabs label="Community experience sections" items={[
        {
          id: 'overview', label: 'Experience overview', content: <div className="pb-section">
            <div className={styles.metrics} aria-label="Community experience metrics">
              <KpiCard label="Sentiment NPS" value={`${nps > 0 ? '+' : ''}${nps}`} icon={<Sparkles size={16} />} />
              <KpiCard label="App adoption" value={`${engagement.appAdoptionPct}%`} icon={<Users size={16} />} />
              <KpiCard label="Open complaints" value={String(openComplaints.length)} icon={<MessageCircle size={16} />} />
              <KpiCard label="High retention signals" value={String(highRiskCount)} icon={<UserMinus size={16} />} />
            </div>

            <div className={styles.analytics}>
              <Card className={styles.panel}>
                <CardHeader title="Community health" subtitle="Engagement, feedback and complaint signals" action={<StatusPill status={health.label} tone={health.band} />} />
                <div className={styles.healthSummary}>
                  <Ring score={health.score} band={health.band} />
                  <div className={styles.panelBody}>
                    <p className={styles.summaryTitle}>A clearer picture of resident experience</p>
                    <p className={styles.secondary}>Use these signals to spot friction and plan supportive follow-up.</p>
                    <p className={styles.metadata}>Composite score · not a satisfaction survey result</p>
                  </div>
                </div>
                <div className={styles.sentimentHeader}>
                  <h4 className={styles.recordTitle}>Resident sentiment</h4>
                  <span className={styles.metadata}>{totalSent} signals</span>
                </div>
                {totalSent > 0 ? <>
                  <div className={styles.sentimentBar} role="img" aria-label={`Resident sentiment: ${sentiment.positive} positive, ${sentiment.neutral} neutral, ${sentiment.negative} negative`}>
                    {SENTIMENTS.map((value) => sentiment[value] > 0 ? <span key={value} style={{ width: `${sentiment[value] / sentimentDivisor * 100}%`, background: toneVar(SENT_TONE[value]) }} /> : null)}
                  </div>
                  <div className={styles.sentimentLegend}>
                    {SENTIMENTS.map((value) => <div key={value} className={styles.sentimentItem}>
                      <span className={styles.metadata}><span className={styles.dot} style={{ background: toneVar(SENT_TONE[value]) }} />{value}</span>
                      <span className={styles.sentimentCount}>{sentiment[value]}</span>
                    </div>)}
                  </div>
                </> : <p className={styles.emptyCopy}>No feedback signals recorded yet.</p>}
              </Card>

              <Card className={styles.panel}>
                <CardHeader title="Resident engagement" subtitle="How your community connects and participates" />
                <div className={styles.activeSummary}>
                  <span className={styles.summaryIcon}><Users size={18} aria-hidden="true" /></span>
                  <p className={styles.panelBody}><strong>{engagement.activeResidents}</strong> of {engagement.totalResidents} residents active</p>
                </div>
                <div className={styles.engagementBars}>
                  {bars.map((bar) => <div key={bar.label}>
                    <div className={styles.barLabel}><span>{bar.label}</span><span>{bar.pct}%</span></div>
                    <div className={styles.track} role="progressbar" aria-label={bar.label} aria-valuenow={percent(bar.pct)} aria-valuemin={0} aria-valuemax={100}>
                      <span className={styles.fill} style={{ width: `${percent(bar.pct)}%` }} />
                    </div>
                  </div>)}
                </div>
                <p className={styles.panelFootnote}>Recorded engagement snapshot. These figures are not a live activity feed.</p>
              </Card>
            </div>
            <p className={styles.contextNote}><Heart size={14} aria-hidden="true" /> Recorded community signals · only records in your authorised estate scope.</p>
          </div>,
        },
        {
          id: 'risk', label: 'Hotspots & retention', content: <div className={styles.analytics}>
            <Card className={styles.panel}>
              <CardHeader title="Complaint hotspots" subtitle="Open complaints by recorded building" action={<Building2 size={18} className="text-primary" aria-hidden="true" />} />
              {hotspots.length === 0 ? <EmptyState icon={<Building2 size={22} />} title="No complaint hotspots" description="There are no open complaints in your estate scope." /> : <div className={styles.hotspotList}>
                {hotspots.map((hotspot) => <div key={hotspot.building} className={styles.hotspot}>
                  <div className={styles.barLabel}><span>{hotspot.building}</span><span>{hotspot.open} open</span></div>
                  <div className={styles.hotspotTrack} role="progressbar" aria-label={`Open complaints in ${hotspot.building}`} aria-valuenow={hotspot.open} aria-valuemin={0} aria-valuemax={maxOpen}>
                    <span className={styles.fill} style={{ width: `${hotspot.open / maxOpen * 100}%`, background: toneVar(hotspot.high ? 'danger' : 'warn') }} />
                  </div>
                  <span className={styles.metadata}>{hotspot.high ? `${hotspot.high} high-severity complaint${hotspot.high === 1 ? '' : 's'}` : 'No high-severity complaints'}</span>
                </div>)}
              </div>}
            </Card>

            <Card className={styles.panel}>
              <CardHeader title="Retention signals" subtitle="Rules-based estimates · human review required" action={<UserMinus size={18} className="text-primary" aria-hidden="true" />} />
              {atRisk.length === 0 ? <EmptyState icon={<Users size={22} />} title="No retention signals" description="Recorded feedback and account signals will appear here when available." /> : <ul className={styles.riskList}>
                {atRisk.slice(0, 5).map((row) => <li key={row.name} className={styles.riskRow}>
                  <Avatar name={row.name} size={36} />
                  <div className={styles.recordContent}><p className={styles.recordTitle}>{row.name}</p><p className={styles.metadata}>{row.unitLabel} · {row.note}</p></div>
                  <StatusPill status={`${row.score}/100 · ${row.band === 'danger' ? 'High' : row.band === 'warn' ? 'Elevated' : 'Lower'}`} tone={row.band} />
                </li>)}
              </ul>}
              <p className={styles.panelFootnote}>These signals help prioritise supportive outreach. They are not verified move-out intentions or housing decisions.</p>
            </Card>
          </div>,
        },
        {
          id: 'feedback', label: 'Resident voice', content: <Card padded={false} className={styles.panel}>
            <div className={styles.registerHeader}><CardHeader title="Resident voice" subtitle="Listen, acknowledge and follow up with your community" action={<StatusPill status={`${pendingFeedback} awaiting acknowledgement`} tone={pendingFeedback ? 'warn' : 'success'} />} /></div>
            {shownFeedback.length === 0 ? <EmptyState icon={<MessageCircle size={22} />} title="No resident feedback yet" description="Feedback recorded in your estate will appear here." /> : <ul className={styles.feedbackList}>
              {shownFeedback.map((row) => <li key={row.id} className={styles.record}>
                <Avatar name={row.residentName} size={36} />
                <div className={styles.recordContent}>
                  <div className={styles.recordHeading}><p className={styles.recordTitle}>{row.residentName} <span className={styles.unit}>{row.unitLabel}</span></p><StatusPill status={row.sentiment} tone={SENT_TONE[row.sentiment]} /></div>
                  <p className={styles.recordText}>{row.text}</p>
                  <p className={styles.metadata}>{row.topic} · {row.channel} · <time dateTime={row.atISO}>{ago(row.atISO, clockMs)}</time></p>
                </div>
                <div className={styles.recordAction}>{row.acknowledged ? <StatusPill status="Acknowledged" tone="success" /> : <Button type="button" className="pb-action" disabled={pending} aria-label={`Acknowledge feedback from ${row.residentName}`} onClick={() => act(() => acknowledgeFeedback(row.id), 'Acknowledged')} icon={<Check size={15} aria-hidden="true" />}>Acknowledge</Button>}</div>
              </li>)}
            </ul>}
          </Card>,
        },
        {
          id: 'complaints', label: 'Complaints', content: <Card padded={false} className={styles.panel}>
            <div className={styles.registerHeader}><CardHeader title="Complaint register" subtitle="Track severity, location and resolution" action={<StatusPill status={`${openComplaints.length} open`} tone={openComplaints.length ? 'warn' : 'success'} />} /></div>
            {complaints.length === 0 ? <EmptyState icon={<TriangleAlert size={22} />} title="No complaints recorded" description="Complaints in your estate scope will appear here." /> : <div className="pb-table-scroll" role="region" aria-label="Complaint register" tabIndex={0}>
              <table className={`pb-data-table ${styles.complaintsTable}`}>
                <caption className="sr-only">Estate complaints and available resolution actions</caption>
                <thead><tr><th scope="col">Complaint</th><th scope="col">Building</th><th scope="col">Severity</th><th scope="col">Recorded</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{complaints.map((row) => <tr key={row.id}>
                  <th scope="row" className={styles.complaintTitle}>{row.category}</th>
                  <td>{row.building}</td>
                  <td><StatusPill status={row.severity} tone={SEV_TONE[row.severity] ?? 'neutral'} /></td>
                  <td className="text-text-3"><time dateTime={row.atISO}>{ago(row.atISO, clockMs)}</time></td>
                  <td><StatusPill status={row.status} tone={row.status === 'open' ? 'warn' : 'success'} /></td>
                  <td className={styles.tableAction}>{row.status === 'open' ? <Button type="button" className="pb-action" disabled={pending} aria-label={`Resolve ${row.category} in ${row.building}`} onClick={() => act(() => resolveComplaint(row.id), 'Complaint resolved')}>Resolve</Button> : <span className={styles.metadata}>No action needed</span>}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </Card>,
        },
      ]} />
      {toast ? <div role="status" className={styles.toast}>{toast}</div> : null}
    </div>
  );
}

function Ring({ score, band }: { score: number; band: Tone }) {
  const value = percent(score);
  return <div className={styles.ring} role="progressbar" aria-label="Community health score" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <svg width={128} height={128} viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="54" fill="none" stroke="var(--surface-3)" strokeWidth="9" /><circle cx="64" cy="64" r="54" fill="none" stroke={toneVar(band)} strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 64 64)" /></svg>
    <div className={styles.ringValue}><span>{score}</span><span>out of 100</span></div>
  </div>;
}
