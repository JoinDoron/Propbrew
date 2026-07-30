import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { BoardWorkspace, type BoardRow, type MeetingRow } from '@/components/estate/board-workspace';
import type { MotionStatus } from '@/domain/estate';

/** Board & Committee — the residents' committee roster (roles, portfolios, term
 *  expiry), AGM/EGM/committee meetings, and motion authoring that feeds the
 *  Governance pipeline. Gated by announcements (the estate manager convenes it). */
export default async function BoardPage() {
  const { actor } = await requireCapability('announcements');
  const members = repos.boardMembers.list(actor).items;
  const meetings = repos.meetings.list(actor).items;
  const motions = repos.motions.list(actor).items;

  const motionCounts = { draft: 0, open: 0, passed: 0, rejected: 0, quorum_failed: 0 } as Record<MotionStatus, number>;
  for (const m of motions) motionCounts[m.status] += 1;

  const memberRows: BoardRow[] = members.map((m) => ({ id: m.id, name: m.name, unitLabel: m.unitLabel, role: m.role, portfolio: m.portfolio, sinceISO: m.sinceISO, termEndISO: m.termEndISO }));
  const meetingRows: MeetingRow[] = meetings.map((m) => ({ id: m.id, title: m.title, type: m.type, whenISO: m.whenISO, venue: m.venue, status: m.status, resolutions: m.resolutions, attendees: m.attendees, quorumRequired: m.quorumRequired }));

  return (
    <div className="max-w-[1000px] mx-auto">
      <BoardWorkspace members={memberRows} meetings={meetingRows} motionCounts={motionCounts} nowMs={NOW_MS} />
    </div>
  );
}
