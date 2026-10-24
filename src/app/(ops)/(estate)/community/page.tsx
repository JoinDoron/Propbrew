import { operatingClock } from '@/server/operating-clock';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';

import { communityHealth, npsScore, sentimentBreakdown, complaintHotspots, churnRisk } from '@/domain/estate';
import { CommunityPulse, type AtRisk } from '@/components/estate/community-pulse';
import { withDurableRead } from '@/server/data/durable-records';

const money = (m: number) => `₦${Math.round(m / 100).toLocaleString('en-NG')}`;

/** Community Pulse — resident-experience command centre: sentiment + NPS, an
 *  engagement snapshot, complaint hotspots by building, and an AI-scored move-out
 *  risk list fusing arrears, complaints and disengagement. */
export default async function CommunityPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('announcements', 'read', 'estate');
  const clock = operatingClock();
  const feedback = repos.residentFeedback.list(actor).items;
  const complaints = repos.complaints.list(actor).items;
  const engagement = repos.engagementSnapshot.list(actor).items[0];

  // Arrears sharpen churn risk, but they're a separate capability — guard the read.
  let arrears: { residentName: string; unitLabel: string; amountMinor: number }[] = [];
  try { arrears = repos.collectionCases.list(actor).items.map((c) => ({ residentName: c.residentName, unitLabel: c.unitLabel, amountMinor: c.amountMinor })); } catch { /* no money access */ }

  const cand = new Map<string, { name: string; unitLabel: string; arrears: number; neg: number; pos: number }>();
  const get = (name: string, unitLabel: string) => cand.get(name) ?? { name, unitLabel, arrears: 0, neg: 0, pos: 0 };
  for (const f of feedback) { const e = get(f.residentName, f.unitLabel); if (f.sentiment === 'negative') e.neg++; if (f.sentiment === 'positive') e.pos++; cand.set(f.residentName, e); }
  for (const a of arrears) { const e = get(a.residentName, a.unitLabel); e.arrears += a.amountMinor; if (!e.unitLabel) e.unitLabel = a.unitLabel; cand.set(a.residentName, e); }

  const atRisk: AtRisk[] = [...cand.values()].map((e) => {
    const r = churnRisk({ name: e.name, unitLabel: e.unitLabel, arrearsMinor: e.arrears, complaints: e.neg, engaged: e.pos > 0 });
    const notes: string[] = [];
    if (e.arrears > 0) notes.push(`${money(e.arrears)} owed`);
    if (e.neg > 0) notes.push(`${e.neg} negative`);
    if (e.pos === 0) notes.push('disengaged');
    return { name: e.name, unitLabel: e.unitLabel, score: r.score, band: r.band, note: notes.join(' · ') || 'stable' };
  }).sort((a, b) => b.score - a.score);

  return (
    <div className="pb-page">
      <PageHeader title="Community pulse" subtitle="Your estate’s community activity and service signals." />
      <CommunityPulse
        health={communityHealth(engagement, feedback, complaints)}
        nps={npsScore(feedback)}
        sentiment={sentimentBreakdown(feedback)}
        engagement={{
          appAdoptionPct: engagement?.appAdoptionPct ?? 0, eventAttendancePct: engagement?.eventAttendancePct ?? 0,
          pollParticipationPct: engagement?.pollParticipationPct ?? 0, announcementReadPct: engagement?.announcementReadPct ?? 0,
          activeResidents: engagement?.activeResidents ?? 0, totalResidents: engagement?.totalResidents ?? 0,
        }}
        feedback={feedback.map((f) => ({ id: f.id, residentName: f.residentName, unitLabel: f.unitLabel, channel: f.channel, sentiment: f.sentiment, topic: f.topic, text: f.text, atISO: f.atISO, acknowledged: f.acknowledged }))}
        complaints={complaints.map((c) => ({ id: c.id, building: c.building, category: c.category, severity: c.severity, status: c.status, atISO: c.atISO }))}
        hotspots={complaintHotspots(complaints)}
        atRisk={atRisk}
        nowMs={clock.nowMs}
      />
    </div>
  );
  });
}
