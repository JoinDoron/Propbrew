import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { updateProjectDetails } from '@/server/actions/construction';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const details = { name: 'Private sandbox project', location: 'Ikeja, Lagos', clientName: 'Sample client' };
const projects = () => state.collections.constructionProjects as { id: string; tenantId: string; status: string; name: string; location: string; clientName: string; approvedBudget: unknown; contractValue: unknown }[];
function actor(access: 'manage' | 'view' = 'manage') {
  return actorForCompanyMember({ membershipId: 'project-editor', userId: 'sample-operator', companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: access }, estateIds: [], allEstates: true }, 'sample-operator')!;
}
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
beforeEach(() => { vi.stubEnv('DATA_SOURCE', 'memory'); state = createDemoWorkspaceState(tenant); boundary.actor.mockResolvedValue(actor()); });
afterEach(() => vi.unstubAllEnvs());

describe('construction project identity editing', () => {
  it('saves scoped details and audit attribution while preserving financial approvals', async () => {
    const project = projects()[0], budget = structuredClone(project.approvedBudget), contract = structuredClone(project.contractValue);
    await expect(run(() => updateProjectDetails(project.id, details))).resolves.toEqual({ ok: true, ref: details.name });
    expect(project).toMatchObject(details); expect(project.approvedBudget).toEqual(budget); expect(project.contractValue).toEqual(contract);
    expect(state.collections.constructionAudit).toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: tenant, actorId: 'sample-operator', entity: 'project_details', projectId: project.id })]));
  });
  it('rejects financial or identity-scope injection without any mutation', async () => {
    const before = structuredClone(state);
    await expect(run(() => updateProjectDetails(projects()[0].id, { ...details, approvedBudget: 0 } as typeof details))).resolves.toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });
  it('cannot edit a foreign tenant project even when its record reference is known', async () => {
    const target = projects()[0]; target.tenantId = '28a9827b-b864-4eb5-9c30-4635f64e2908';
    const before = structuredClone(state);
    await expect(run(() => updateProjectDetails(target.id, details))).resolves.toMatchObject({ ok: false, error: 'Project not found.' });
    expect(state).toEqual(before);
  });
  it.each(['completed', 'closing'])('keeps a %s project terminal', async (status) => {
    projects()[0].status = status; const before = structuredClone(state);
    await expect(run(() => updateProjectDetails(projects()[0].id, details))).resolves.toMatchObject({ ok: false }); expect(state).toEqual(before);
  });
  it('keeps the normal view-only company role unable to edit project records', async () => {
    boundary.actor.mockResolvedValue(actor('view')); const before = structuredClone(state);
    await expect(run(() => updateProjectDetails(projects()[0].id, details))).resolves.toMatchObject({ ok: false }); expect(state).toEqual(before);
  });
});
