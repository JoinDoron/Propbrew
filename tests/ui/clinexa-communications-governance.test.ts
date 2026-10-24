import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsWorkspace, Composer } from '@/components/announcements/announcements-workspace';
import { GovernanceWorkspace, type MotionRow } from '@/components/estate/governance-workspace';
import { BoardWorkspace, MotionDialog, HeldDialog, NominateDialog, type BoardRow, type MeetingRow, type ElectionRow, type EgmData } from '@/components/estate/board-workspace';
import { CommitteeDecisionDialog, committeeDate } from '@/components/estate/committee-ui';
import type { Announcement } from '@/domain/entities';
import * as actions from '@/server/actions/estate';
import { sendAnnouncement } from '@/server/actions/announcements';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/announcements', () => ({ sendAnnouncement: vi.fn() }));
vi.mock('@/server/actions/estate', () => ({ castVote: vi.fn(), openMotion: vi.fn(), closeMotion: vi.fn(), createMotion: vi.fn(), recordMeetingHeld: vi.fn(), nominateCandidate: vi.fn(), openElectionVoting: vi.fn(), decideElection: vi.fn(), exerciseProxies: vi.fn(), revokeProxyLink: vi.fn() }));

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const announcements = () => read('src/components/announcements/announcements-workspace.tsx');
const governance = () => read('src/components/estate/governance-workspace.tsx');
const board = () => read('src/components/estate/board-workspace.tsx');
const decision = () => read('src/components/estate/committee-ui.tsx');
const nowMs = Date.parse('2026-10-23T12:00:00Z');
const notice = { tenantId: 'tenant-a', id: 'announcement-a', estateId: 'estate-a', title: 'Water supply update', body: 'Water will be restored at 16:00.\nPlease keep taps closed.', scope: 'estate', audience: 'All residents', sentAt: '2026-10-23T10:00:00Z', delivered: 120, read: 60, aiDrafted: true } as Announcement;
const motion: MotionRow = { id: 'motion-a', ref: 'AGM-01', title: 'Approve solar installation', summary: 'Review the estate solar proposal.', category: 'works', status: 'open', opensISO: '2026-10-20', closesISO: '2026-10-25', eligibleWeight: 100, forWeight: 30, againstWeight: 10, abstainWeight: 5, quorumPct: 33, thresholdPct: 50 };
const member: BoardRow = { id: 'member-a', name: 'Ada Okafor', unitLabel: 'Block A · 01A', role: 'Chair', portfolio: 'Operations', sinceISO: '2025-01-01', termEndISO: '2026-11-01' };
const meeting: MeetingRow = { id: 'meeting-a', title: 'October committee meeting', type: 'EGM', whenISO: '2026-10-25T14:00:00Z', venue: 'Community hall', status: 'scheduled', resolutions: 0, attendees: 0, quorumRequired: 12 };
const election: ElectionRow = { id: 'election-a', ref: 'EL-01', seatTitle: 'Treasurer', portfolio: 'Finance', status: 'voting', closesISO: '2026-10-25', eligibleWeight: 100, quorumPct: 33, candidates: [{ id: 'candidate-a', residentName: 'Bisi Ade', unitLabel: 'Block B · 02A', statement: 'Transparent finance records.', votes: 30 }, { id: 'candidate-b', residentName: 'Tobi Bello', unitLabel: 'Block C · 03A', statement: 'Clearer budgets.', votes: 10 }] };
const egm: EgmData = { motion: { ...motion, meetingLabel: 'October EGM' }, proxies: [{ id: 'proxy-a', motionId: motion.id, grantorName: 'Chidi Obi', grantorUnit: 'Block D · 04A', holderName: 'Ada Okafor', direction: 'for', status: 'held' }] };
const boardProps: ComponentProps<typeof BoardWorkspace> = { members: [member], meetings: [meeting], elections: [election], egm, motionCounts: { draft: 1, open: 1, passed: 2, rejected: 0, quorum_failed: 0 }, nowMs, canCreate: true, canMutate: true };
const renderBoard = (props: Partial<ComponentProps<typeof BoardWorkspace>> = {}) => renderToStaticMarkup(createElement(BoardWorkspace, { ...boardProps, ...props }));
const renderGovernance = (props: Partial<ComponentProps<typeof GovernanceWorkspace>> = {}) => renderToStaticMarkup(createElement(GovernanceWorkspace, { motions: [motion], nowMs, canMutate: true, ...props }));
const renderAnnouncements = (rows: Announcement[] = [notice], canMutate = true) => renderToStaticMarkup(createElement(AnnouncementsWorkspace, { rows, canMutate }));

beforeEach(() => vi.clearAllMocks());

describe('Clinexa-aligned communications and governance', () => {
  it('reuses shared cards, headings, status and full-size controls throughout all three workspaces', () => {
    for (const source of [announcements(), governance(), board()]) {
      for (const name of ['Card', 'CardHeader', 'KpiCard', 'StatusPill', 'Button', 'EmptyState']) expect(source).toMatch(new RegExp(`<${name}(?:\\s|>)`));
      expect(source).toContain('workspace-layout.module.css');
      expect(source).not.toContain('pb-hero');
      expect(source).not.toMatch(/text-\[(?:9|10|11|12\.5)px\]/);
    }
  });

  it('preserves the announcements and delivery tab identifiers, order and mounted panels', () => {
    const html = renderAnnouncements();
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(announcements().indexOf("id: 'announcements'")).toBeLessThan(announcements().indexOf("id: 'delivery'"));
    expect(html).toContain(' hidden=""');
  });

  it('retains original governance tab order and all conditional board sections', () => {
    expect(governance().indexOf("id: 'motions'")).toBeLessThan(governance().indexOf("id: 'overview'"));
    const html = renderBoard();
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    for (const id of ['overview', 'committee', 'meetings', 'voting']) expect(board()).toContain(`id: '${id}'`);
    expect(renderBoard({ egm: null, elections: [] }).match(/role="tab"/g)).toHaveLength(3);
  });

  it('keeps notice content, audience and exact recorded read counts visible', () => {
    const html = renderAnnouncements();
    for (const text of [notice.title, notice.audience, '120', '60', '50%', 'Recorded as sent', 'Recorded deliveries']) expect(html).toContain(text);
    expect(html).toContain('aria-label="Search announcements"');
    expect(html).toContain('aria-label="View announcement Water supply update"');
    expect(html).toContain('scope="col"');
  });

  it('renders honest empty and zero states without fake counts or invalid charts', () => {
    const noticeHtml = renderAnnouncements([], false);
    const governanceHtml = renderGovernance({ motions: [], canMutate: false });
    const boardHtml = renderBoard({ members: [], meetings: [], elections: [], egm: null, canCreate: false, canMutate: false });
    expect(noticeHtml).toContain('No announcements in your scope yet');
    expect(governanceHtml).toContain('No motions in your scope yet');
    expect(boardHtml).toContain('No committee members in your scope');
    expect(boardHtml).toContain('No meetings in your scope');
    for (const html of [noticeHtml, governanceHtml, boardHtml]) expect(html).not.toMatch(/NaN|Infinity/);
    expect(governance()).toContain('total > 0');
    expect(governance()).not.toMatch(/total\s*=.*\|\|\s*1/);
  });

  it('uses snapshot and local-template disclosures rather than fabricated provider or AI activity', () => {
    expect(renderAnnouncements()).toContain('not independently verified provider callbacks');
    expect(announcements()).toContain('Uses local message templates, not a connected AI provider');
    expect(announcements()).not.toContain('Math.random');
    expect(announcements()).not.toContain('await sleep');
    expect(renderGovernance()).toContain('Governance snapshot');
    expect(renderBoard()).toContain('23 Oct 2026');
    expect(governance()).toContain('No AI decision is made');
  });

  it('matches mutation visibility to the exact server capability verbs without enlarging grants', () => {
    expect(read('src/app/(ops)/(estate)/announcements/page.tsx')).toContain("can(actor, 'announcements', 'transition').allowed");
    expect(read('src/app/(ops)/(estate)/governance/page.tsx')).toContain("can(actor, 'announcements', 'update').allowed");
    const page = read('src/app/(ops)/(estate)/board/page.tsx');
    expect(page).toContain("can(actor, 'announcements', 'create').allowed");
    expect(page).toContain("can(actor, 'announcements', 'update').allowed");
    expect(renderAnnouncements([notice], false)).not.toContain('>Compose announcement</button>');
    const readonlyBoard = renderBoard({ canCreate: false, canMutate: false });
    for (const text of ['>Table a motion</button>', '>Nominate</button>', '>Exercise proxies</button>', '>Close &amp; declare</button>', '>Record held</button>']) expect(readonlyBoard).not.toContain(text);
    expect(renderGovernance({ canMutate: false })).not.toContain('aria-label="Vote for');
  });

  it('does not call any publishing or voting action while rendering or opening a read-only view', () => {
    renderAnnouncements(); renderGovernance(); renderBoard();
    expect(sendAnnouncement).not.toHaveBeenCalled();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it('preserves board roster, meeting, candidate and proxy information in readable registers', () => {
    const html = renderBoard();
    for (const text of ['Ada Okafor', 'Block A · 01A', 'Operations', meeting.title, meeting.venue, 'Bisi Ade', 'Transparent finance records.', 'Tobi Bello', 'Chidi Obi', 'Block D · 04A', 'EGM proxy register', 'Committee roster', 'Committee meeting register']) expect(html).toContain(text);
    expect(html.match(/<table/g)).toHaveLength(3);
    expect(html).toContain('pb-data-table');
    expect(html).toContain('scope="col"');
    expect(board()).not.toMatch(/<tr[^>]*onClick=/);
  });

  it('preserves motion thresholds, recorded tallies and descriptive chart labels', () => {
    const html = renderGovernance();
    for (const text of ['AGM-01', 'Approve solar installation', 'Review the estate solar proposal.', '30 for, 10 against and 5 abstentions', 'Requires 33% of 100 eligible unit weights', 'Requires 50% approval']) expect(html).toContain(text);
    expect(html).toContain('role="img"');
    expect(governance()).toContain('motionOutcome(motion)');
    expect(governance()).toContain('castVote(motion.id, choice)');
  });

  it('clearly separates projected proxy turnout from recorded turnout', () => {
    const html = renderBoard();
    expect(html).toContain('Recorded quorum');
    expect(html).toContain('projected turnout');
    expect(html).toContain('if the 1 held proxy record(s) are exercised');
    expect(board()).toContain('resolveProxyChain(proxy, proxies)');
    expect(board()).toContain('chain.path.map(proxyHolderName)');
  });

  it('requires explicit confirmation for ballots, motion decisions, election decisions and proxies', () => {
    expect(governance()).toContain('Confirm recorded ballot');
    expect(governance()).toContain('Confirm close vote');
    expect(governance()).toContain('Confirm open voting');
    for (const text of ['Confirm revoke proxy', 'Confirm exercise proxies', 'Confirm open election', 'Confirm close and declare']) expect(board()).toContain(text);
    expect(decision()).toContain('decision.action()');
    expect(decision()).toContain('canClose={!pending}');
    expect(decision()).toContain('role="alert"');
  });

  it('discloses consequential meeting and governance side effects before the confirmation', () => {
    const html = renderToStaticMarkup(createElement(HeldDialog, { meeting, onClose: vi.fn(), onDone: vi.fn() }));
    expect(html).toContain('expires any unused proxies');
    expect(html).toContain('resolves its open EGM motions');
    expect(html).toContain('creates outcome announcements');
    expect(html).toContain('Confirm held and resolve votes');
    expect(governance()).toContain('creates a resident announcement');
    expect(board()).toContain('revokes upstream assignments');
  });

  it('formats committee dates in an explicit UTC calendar without altering invalid input', () => {
    expect(committeeDate('2026-10-23T23:59:00Z')).toBe('23 Oct 2026');
    expect(committeeDate('invalid')).toBe('invalid');
    expect(decision()).toContain("timeZone: 'UTC'");
  });

  it('uses native modal semantics, named dismiss controls and protected pending states', () => {
    const html = renderToStaticMarkup(createElement(CommitteeDecisionDialog, { decision: { title: 'Close motion voting', record: 'AGM-01', description: 'Review recorded votes.', confirmLabel: 'Confirm', action: vi.fn(), success: 'Closed' }, onClose: vi.fn(), onDone: vi.fn() }));
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Close motion voting"');
    expect(html).toContain('aria-label="Close close motion voting"');
    for (const source of [announcements(), board(), decision()]) {
      expect(source).toContain('canClose={!pending}');
      expect(source).not.toContain('fixed inset-0 z-');
      expect(source).toContain('catch');
      expect(source).toContain('role="alert"');
    }
  });
});

describe('Clinexa-aligned communications and committee forms', () => {
  it('has associated announcement labels and does not auto-publish when drafting', () => {
    const html = renderToStaticMarkup(createElement(Composer, { onClose: vi.fn(), onSent: vi.fn() }));
    for (const id of ['announcement-topic', 'announcement-title', 'announcement-message', 'announcement-scope', 'announcement-audience']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('<legend');
    expect(html).toContain('Delivery channels');
    expect(html).toContain('Review announcement');
    expect(html).toContain('aria-label="Close announcement composer"');
    expect(sendAnnouncement).not.toHaveBeenCalled();
  });

  it('preserves AI provenance and requires manager reapproval after text or translation changes', () => {
    const source = announcements();
    expect(source).toContain('aiDrafted && !approved');
    expect(source).toContain('setAiDrafted(true)');
    expect(source).not.toContain('setAiDrafted(false)');
    expect(source).toContain('setTitle(event.target.value); setApproved(false)');
    expect(source).toContain('setBody(event.target.value); setApproved(false)');
    expect(source).toContain('Editing the text requires approval again');
    expect(source).toContain('if (pending || !valid || !reviewing) return;');
    expect(source).toContain('Confirm and save notice');
  });

  it('accepts an operator-selected scheduled time without a stale hardcoded timestamp', () => {
    const source = announcements();
    expect(source).toContain('type="datetime-local"');
    expect(source).toContain('new Date(scheduleAt)');
    expect(source).toContain('when?.toISOString() ?? null');
    expect(source).toContain('when.getTime() <= Date.now()');
    expect(source).not.toContain('2026-07-30T09:00:00Z');
    expect(source).toContain('no background delivery worker is connected here');
  });

  it('has associated motion fields with meaningful percentage constraints', () => {
    const html = renderToStaticMarkup(createElement(MotionDialog, { onClose: vi.fn(), onDone: vi.fn() }));
    for (const id of ['motion-title', 'motion-summary', 'motion-category', 'motion-quorum', 'motion-threshold']) { expect(html).toContain(`for="${id}"`); expect(html).toContain(`id="${id}"`); }
    expect(html).toContain('min="1"');
    expect(html).toContain('max="100"');
    expect(html).toContain('This saves a draft motion');
    expect(actions.createMotion).not.toHaveBeenCalled();
  });

  it('keeps meeting attendance non-negative and shows errors inside the active modal', () => {
    const html = renderToStaticMarkup(createElement(HeldDialog, { meeting, onClose: vi.fn(), onDone: vi.fn() }));
    expect(html).toContain('for="meeting-attendance"');
    expect(html).toContain('id="meeting-attendance"');
    expect(html).toContain('min="0"');
    expect(board()).toContain('Number.isSafeInteger(count)');
    expect(board()).toContain('recordMeetingHeld(meeting.id, count)');
    expect(board()).toContain('setError(result.error)');
  });

  it('has named nomination fields and does not confuse a nomination with an election result', () => {
    const html = renderToStaticMarkup(createElement(NominateDialog, { el: election, onClose: vi.fn(), onDone: vi.fn() }));
    for (const id of ['candidate-name', 'candidate-unit', 'candidate-statement']) { expect(html).toContain(`for="${id}"`); expect(html).toContain(`id="${id}"`); }
    expect(html).toContain('not an elected appointment');
    expect(board()).toContain('nominateCandidate(el.id, fields)');
    expect(actions.nominateCandidate).not.toHaveBeenCalled();
  });

  it('retains refresh, feedback dismissal and safe asynchronous error handling', () => {
    for (const source of [announcements(), board(), decision()]) { expect(source).toContain('router.refresh()'); expect(source).toContain('Please try again.'); }
    expect(announcements()).toContain('Dismiss announcement notification');
    expect(decision()).toContain('Dismiss committee notification');
    expect(decision()).toContain('role="status"');
  });

  it('uses themed responsive density with dedicated local charts and no blanket overrides', () => {
    for (const file of ['src/components/announcements/announcements-workspace.module.css', 'src/components/estate/committee.module.css']) {
      const source = read(file);
      for (const token of ['gap: 24px', 'gap: 16px', 'font-size: 14px', 'font-size: 12px', 'var(--', 'min-width: 0', '@media']) expect(source).toContain(token);
      expect(source).not.toContain('!important');
    }
    expect(announcements()).not.toMatch(/<KpiCard[^>]*delta=/);
    expect(governance()).not.toMatch(/<KpiCard[^>]*delta=/);
    expect(board()).not.toMatch(/<KpiCard[^>]*delta=/);
  });
});
