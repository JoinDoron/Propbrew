import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { advanceConstructionQualityIssue, recordConstructionQualityIssue, reviewConstructionClash } from '@/server/actions/construction';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const projects = () => state.collections.constructionProjects as { id: string; tenantId: string }[];
const issues = () => state.collections.constructionIssues as { id: string; tenantId: string; projectId: string; category: string; status: string; evidenceReference?: string }[];
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
function siteManager(projectId: string) {
  return actorForCompanyMember({ membershipId: 'site-manager-test', userId: 'site-user', companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, operationalProfileId: 'site-manager', estateIds: [], allEstates: false, constructionProjectIds: [projectId], allConstructionProjects: false }, 'site-user')!;
}
const input = (projectId: string) => ({ projectId, category: 'Design clash' as const, title: 'Drainage run crosses structural beam', severity: 'high' as const, owner: 'Site engineer', dueISO: '2026-11-12', location: 'Block A, floor 2', sourceReference: 'MEP-R03', relatedReference: 'STR-R04' });

beforeEach(() => { vi.stubEnv('DATA_SOURCE', 'memory'); state = createDemoWorkspaceState(tenant); boundary.actor.mockResolvedValue(siteManager(projects()[0].id)); });
afterEach(() => vi.unstubAllEnvs());

describe('construction quality and coordination', () => {
  it('records a project-scoped clash and requires resolution evidence', async () => {
    const projectId = projects()[0].id;
    const result = await run(() => recordConstructionQualityIssue(input(projectId)));
    expect(result.ok).toBe(true);
    const issue = issues().find((row) => row.id === (result.ok ? result.ref : ''))!;
    expect(issue).toMatchObject({ tenantId: tenant, projectId, category: 'Design clash', status: 'open' });
    expect((await run(() => advanceConstructionQualityIssue(issue.id, 'resolved', 'The MEP route was rerouted.'))).ok).toBe(false);
    expect(issue.status).toBe('open');
    expect((await run(() => advanceConstructionQualityIssue(issue.id, 'resolved', 'The MEP route was rerouted.', 'Field-photo-482'))).ok).toBe(false);
    expect((await run(() => reviewConstructionClash(issue.id, 'confirmed', 'Reviewed the controlled MEP and structural revisions.', 'MEP-R03 / STR-R04'))).ok).toBe(true);
    expect((await run(() => advanceConstructionQualityIssue(issue.id, 'resolved', 'The MEP route was rerouted.', 'Field-photo-482'))).ok).toBe(true);
    expect(issue).toMatchObject({ status: 'resolved', evidenceReference: 'Field-photo-482' });
    expect(state.collections.constructionAudit).toEqual(expect.arrayContaining([expect.objectContaining({ entity: 'construction_issue', projectId, action: 'resolve' })]));
  });

  it('rejects records outside the assigned project and foreign-company issues', async () => {
    expect(projects().length).toBeGreaterThan(1);
    const before = issues().length;
    expect((await run(() => recordConstructionQualityIssue(input(projects()[1].id)))).ok).toBe(false);
    expect(issues()).toHaveLength(before);
    const created = await run(() => recordConstructionQualityIssue(input(projects()[0].id)));
    expect(created.ok).toBe(true);
    const issue = issues().find((row) => row.id === (created.ok ? created.ref : ''))!;
    issue.tenantId = '28a9827b-b864-4eb5-9c30-4635f64e2908';
    expect((await run(() => advanceConstructionQualityIssue(issue.id, 'resolved', 'Corrective route confirmed.', 'Photo-482'))).ok).toBe(false);
    expect(issue.status).toBe('open');
  });

  it('requires the authority name and both clash references', async () => {
    const projectId = projects()[0].id;
    expect((await run(() => recordConstructionQualityIssue({ ...input(projectId), category: 'Authority inspection', authority: '' }))).ok).toBe(false);
    expect((await run(() => recordConstructionQualityIssue({ ...input(projectId), relatedReference: '' }))).ok).toBe(false);
  });
});
