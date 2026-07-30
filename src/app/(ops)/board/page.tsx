import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { BoardWorkspace, type BoardRow, type MeetingRow, type ElectionRow, type EgmData } from '@/components/estate/board-workspace';
import type { MotionStatus } from '@/domain/estate';

/** Board & Committee — the residents' committee roster (roles, portfolios, term
 *  expiry), AGM/EGM/committee meetings, and motion authoring that feeds the
 *  Governance pipeline. Gated by announcements (the estate manager convenes it). */
export default async function BoardPage() {
  const { actor } = await requireCapability('announcements');
  const members = repos.boardMembers.list(actor).items;
  const meetings = repos.meetings.list(actor).items;
  const motions = repos.motions.list(actor).items;
  const elections = repos.boardElections.list(actor).items;
  const proxies = repos.proxyAssignments.list(actor).items;

  const egmMotion = motions.find((m) => m.egm && m.status === 'open');
  const egmMeeting = egmMotion?.egmMeetingId ? meetings.find((mt) => mt.id === egmMotion.egmMeetingId) : undefined;
  const egm: EgmData = egmMotion ? {
    motion: { id: egmMotion.id, ref: egmMotion.ref, title: egmMotion.title, meetingLabel: egmMeeting ? `${egmMeeting.type} · ${egmMeeting.whenISO.slice(0, 10)}` : 'EGM', forWeight: egmMotion.forWeight, againstWeight: egmMotion.againstWeight, abstainWeight: egmMotion.abstainWeight, eligibleWeight: egmMotion.eligibleWeight, quorumPct: egmMotion.quorumPct, thresholdPct: egmMotion.thresholdPct },
    proxies: proxies.filter((p) => p.motionId === egmMotion.id).map((p) => ({ id: p.id, motionId: p.motionId, grantorName: p.grantorName, grantorUnit: p.grantorUnit, holderName: p.holderName, direction: p.direction, status: p.status })),
  } : null;

  const motionCounts = { draft: 0, open: 0, passed: 0, rejected: 0, quorum_failed: 0 } as Record<MotionStatus, number>;
  for (const m of motions) motionCounts[m.status] += 1;

  const memberRows: BoardRow[] = members.map((m) => ({ id: m.id, name: m.name, unitLabel: m.unitLabel, role: m.role, portfolio: m.portfolio, sinceISO: m.sinceISO, termEndISO: m.termEndISO }));
  const meetingRows: MeetingRow[] = meetings.map((m) => ({ id: m.id, title: m.title, type: m.type, whenISO: m.whenISO, venue: m.venue, status: m.status, resolutions: m.resolutions, attendees: m.attendees, quorumRequired: m.quorumRequired }));
  const electionRows: ElectionRow[] = elections.map((e) => ({ id: e.id, ref: e.ref, seatTitle: e.seatTitle, portfolio: e.portfolio, status: e.status, closesISO: e.closesISO, eligibleWeight: e.eligibleWeight, quorumPct: e.quorumPct, candidates: e.candidates.map((c) => ({ id: c.id, residentName: c.residentName, unitLabel: c.unitLabel, statement: c.statement, votes: c.votes })), winnerCandidateId: e.winnerCandidateId }));

  return (
    <div className="max-w-[1000px] mx-auto">
      <BoardWorkspace members={memberRows} meetings={meetingRows} elections={electionRows} egm={egm} motionCounts={motionCounts} nowMs={NOW_MS} />
    </div>
  );
}
