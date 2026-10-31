import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import type { SafetyEvent, SafetyPermit, ToolboxTalk } from '@/domain/construction/types';
import { safetyStats } from '@/domain/construction';
import {
  activateSafetyPermit, assignSafetyCorrectiveAction, closeSafetyPermit, decideSafetyPermit,
  escalateOverdueSafetyAction, recordToolboxTalk, requestSafetyPermit, reviewSafetyCorrectiveAction,
  startSafetyCorrectiveAction, submitSafetyCorrectiveAction,
} from '@/server/actions/construction-safety';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
const permits = () => state.collections.constructionSafetyPermits as SafetyPermit[];
const events = () => state.collections.constructionSafetyEvents as SafetyEvent[];
const talks = () => state.collections.constructionToolboxTalks as ToolboxTalk[];
const member = (userId: string, role: string, projectIds = ['cp-marina'], companyId = tenant) => actorForCompanyMember({
  membershipId: userId, userId, companyId, companyRole: 'member', status: 'active', companyStatus: 'active',
  modules: { construction: 'manage' }, operationalProfileId: role, estateIds: [], allEstates: false,
  constructionProjectIds: projectIds, allConstructionProjects: false,
}, userId)!;
const as = (userId: string, role: string, projectIds?: string[]) => boundary.actor.mockResolvedValue(member(userId, role, projectIds));
const request = () => ({ projectId: 'cp-marina', type: 'hot_work' as const, location: 'Block A roof east', supervisor: 'Site supervisor', validFromISO: '2026-07-26', validToISO: '2026-07-27', controls: ['Fire watch and extinguisher checked'] });

beforeEach(() => {
  vi.stubEnv('DATA_SOURCE', 'memory');
  vi.stubEnv('PROPBREW_AUTH_MODE', 'demo');
  state = createDemoWorkspaceState(tenant);
  as('site-lead', 'site-manager');
});

describe('Construction site safety operations', () => {
  it('requires an independent permit decision and an on-site control check before activation and closure', async () => {
    const created = await run(() => requestSafetyPermit(request()));
    expect(created.ok).toBe(true);
    const permit = permits().find((row) => row.ref === (created.ok ? created.ref : ''))!;
    expect(permit.status).toBe('requested');
    expect((await run(() => decideSafetyPermit(permit.id, 'approved'))).ok).toBe(false);
    expect((await run(() => activateSafetyPermit(permit.id, true, 'All controls checked at roof.'))).ok).toBe(false);
    as('hse-reviewer', 'construction-hse');
    expect((await run(() => decideSafetyPermit(permit.id, 'approved'))).ok).toBe(true);
    expect(permit.status).toBe('approved');
    as('site-lead', 'site-manager');
    expect((await run(() => activateSafetyPermit(permit.id, false, 'All controls checked at roof.'))).ok).toBe(false);
    expect((await run(() => activateSafetyPermit(permit.id, true, 'All controls checked at roof.'))).ok).toBe(true);
    expect(permit.status).toBe('active');
    expect((await run(() => closeSafetyPermit(permit.id, 'Work area restored and cleared.'))).ok).toBe(true);
    expect(permit).toMatchObject({ status: 'closed', reviewedById: 'hse-reviewer', activatedById: 'site-lead', closedById: 'site-lead' });
    expect((await run(() => closeSafetyPermit(permit.id, 'Close it again.'))).ok).toBe(false);
    expect((state.collections.constructionAudit as { entity: string }[]).filter((row) => row.entity === 'safety_permit')).toHaveLength(4);
  });

  it('records toolbox talks and keeps corrective work open until independent evidence review', async () => {
    const talk = await run(() => recordToolboxTalk({ projectId: 'cp-marina', topic: 'Hot work briefing', atISO: '2026-07-26', attendees: 12, deliveredBy: 'Site lead', location: 'Block A roof east' }));
    expect(talk.ok).toBe(true);
    expect(talks()[0]).toMatchObject({ topic: 'Hot work briefing', attendees: 12, recordedById: 'site-lead' });
    const event = events().find((row) => row.id === 'se-6')!;
    expect((await run(() => assignSafetyCorrectiveAction(event.id, { ownerUserId: 'site-lead', dueISO: '2026-07-26', description: 'Clear and inspect the material drop before next pour.' }))).ok).toBe(true);
    expect(event.closed).toBe(false);
    expect((await run(() => startSafetyCorrectiveAction(event.id))).ok).toBe(true);
    expect((await run(() => submitSafetyCorrectiveAction(event.id, 'PHOTO-081', 'Area cleared; supervisor inspected the drop zone.'))).ok).toBe(true);
    expect(event.corrective?.status).toBe('awaiting_review');
    expect((await run(() => reviewSafetyCorrectiveAction(event.id, 'verified', 'Evidence and controls checked on site.'))).ok).toBe(false);
    as('hse-reviewer', 'construction-hse');
    expect((await run(() => reviewSafetyCorrectiveAction(event.id, 'returned', 'Add the supervisor inspection reference.'))).ok).toBe(true);
    expect(event.closed).toBe(false);
    as('site-lead', 'site-manager');
    expect((await run(() => startSafetyCorrectiveAction(event.id))).ok).toBe(true);
    expect((await run(() => submitSafetyCorrectiveAction(event.id, 'PHOTO-081-SUP', 'Supervisor inspection reference added and area remains clear.'))).ok).toBe(true);
    as('hse-reviewer', 'construction-hse');
    expect((await run(() => reviewSafetyCorrectiveAction(event.id, 'verified', 'Evidence and controls checked on site.'))).ok).toBe(true);
    expect(event).toMatchObject({ closed: true, corrective: { status: 'verified', reviewedById: 'hse-reviewer', evidenceReference: 'PHOTO-081-SUP' } });
    expect((await run(() => reviewSafetyCorrectiveAction(event.id, 'returned', 'Return this work to owner.'))).ok).toBe(false);
  });

  it('flags overdue corrective work and records a single escalation', async () => {
    const event = events().find((row) => row.id === 'se-6')!;
    expect((await run(() => assignSafetyCorrectiveAction(event.id, { ownerUserId: 'site-lead', dueISO: '2026-07-26', description: 'Clear and inspect the material drop before next pour.' }))).ok).toBe(true);
    event.corrective!.dueISO = '2026-07-25';
    const stats = safetyStats(events(), permits(), talks(), Date.parse('2026-07-26T12:00:00Z'));
    expect(stats.overdueCorrectiveActions).toBe(1);
    expect((await run(() => escalateOverdueSafetyAction(event.id, 'Missed deadline; work area remains restricted.'))).ok).toBe(true);
    expect(event.corrective?.escalatedById).toBe('site-lead');
    expect((await run(() => escalateOverdueSafetyAction(event.id, 'Try a second escalation.'))).ok).toBe(false);
  });

  it('denies safety mutations across project and company boundaries', async () => {
    as('other-project', 'site-manager', ['cp-cedar']);
    expect((await run(() => requestSafetyPermit(request()))).ok).toBe(false);
    expect((await run(() => closeSafetyPermit('sp-1', 'Attempted cross-project close.'))).ok).toBe(false);
    boundary.actor.mockResolvedValue(member('other-company', 'site-manager', ['cp-marina'], '1cd10a0c-2834-49a9-b3a3-7b1e7567800c'));
    expect((await run(() => requestSafetyPermit(request()))).ok).toBe(false);
    expect((await run(() => assignSafetyCorrectiveAction('se-6', { ownerUserId: 'other-company', dueISO: '2026-07-26', description: 'Wrong company assignment.' }))).ok).toBe(false);
  });
});
