import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityByKey } from '@/server/identities';
import { db } from '@/server/data/store';
import * as construction from '@/server/actions/construction';
import { buildConstructionCopilotContext } from '@/server/ai/context/construction';

const session = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: session.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const manager = () => structuredClone(identityByKey('estate_manager').actor);
const baseline = structuredClone({
  constructionProjects: db.constructionProjects,
  constructionPhases: db.constructionPhases,
  constructionTasks: db.constructionTasks,
  constructionMilestones: db.constructionMilestones,
  constructionCostCodes: db.constructionCostCodes,
  constructionAudit: db.constructionAudit,
});

beforeEach(() => { Object.assign(db, structuredClone(baseline)); session.actor.mockResolvedValue(manager()); });
afterEach(() => Object.assign(db, structuredClone(baseline)));

describe('Construction project mobilisation and programme', () => {
  it('builds WBS, editable dependencies, packages, locations, parties and responsibility records', async () => {
    const project = db.constructionProjects.find((row) => row.status === 'planning')!;
    expect((await construction.saveProjectPhase({ projectId: project.id, name: 'Mobilisation QA', startISO: '2026-11-01', finishISO: '2026-11-30', weight: 10 })).ok).toBe(true);
    const phase = db.constructionPhases.find((row) => row.projectId === project.id && row.name === 'Mobilisation QA')!;
    expect((await construction.saveProgrammeTask({ id: undefined, projectId: project.id, phaseId: phase.id, name: 'Establish site', owner: 'QA Site Manager', plannedStartISO: '2026-11-01', plannedFinishISO: '2026-11-10', priority: 'high', dependsOn: [], budgetNaira: 5_000_000 })).ok).toBe(true);
    const first = db.constructionTasks.find((row) => row.projectId === project.id && row.name === 'Establish site')!;
    expect((await construction.saveProgrammeTask({ projectId: project.id, phaseId: phase.id, name: 'Temporary utilities', owner: 'QA Engineer', plannedStartISO: '2026-11-11', plannedFinishISO: '2026-11-20', priority: 'medium', dependsOn: [first.id], budgetNaira: 3_000_000 })).ok).toBe(true);
    expect((await construction.saveProgrammeTask({ id: first.id, projectId: project.id, phaseId: phase.id, name: 'Establish secured site', owner: 'QA Site Manager', plannedStartISO: '2026-11-01', plannedFinishISO: '2026-11-09', priority: 'high', dependsOn: [], budgetNaira: 5_500_000 })).ok).toBe(true);
    expect(first.name).toBe('Establish secured site');

    expect((await construction.createWorkPackage(project.id, { code: 'QA-MOB-01', name: 'Site mobilisation', phaseId: phase.id, contractor: 'QA Build Ltd', manager: 'QA QS', budgetNaira: 8_500_000 })).ok).toBe(true);
    expect(db.constructionCostCodes.find((row) => row.projectId === project.id && row.code === 'QA-MOB-01')?.budget.minor).toBe(850_000_000);
    expect((await construction.addProjectTeamMember(project.id, { name: 'Amina Bello', organisation: 'QA Build Ltd', role: 'Project director', responsibility: 'Accountable for delivery', accountable: true, email: 'amina@example.com' })).ok).toBe(true);
    expect((await construction.addProjectLocation(project.id, { name: 'Main site', kind: 'site', latitude: 6.5244, longitude: 3.3792 })).ok).toBe(true);
    expect((await construction.addProjectParty(project.id, { name: 'Lagos Planning Authority', kind: 'authority', discipline: 'Planning', permitReference: 'LASPPPA-QA-1', permitExpiryISO: '2027-12-31' })).ok).toBe(true);
    expect(project.mobilisation?.team).toHaveLength(1);
    expect(project.mobilisation?.locations[0]).toMatchObject({ name: 'Main site', latitude: 6.5244 });
    expect(project.mobilisation?.parties[0].permitReference).toBe('LASPPPA-QA-1');
    const aiProject = ((await buildConstructionCopilotContext(manager())).facts.projects as Array<{ id: string; mobilisation?: { workPackages: Array<{ code: string }>; team: Array<Record<string, unknown>> } }>).find((row) => row.id === project.id)!;
    expect(aiProject.mobilisation?.workPackages[0].code).toBe('QA-MOB-01');
    expect(JSON.stringify(aiProject.mobilisation?.team)).not.toContain('amina@example.com');
  });

  it('requires independent baseline approval and controls suspension, closeout and reopening', async () => {
    const project = db.constructionProjects.find((row) => row.status === 'planning')!;
    expect((await construction.submitBaselineRevision(project.id, { name: 'Approved mobilisation plan', reason: 'First controlled delivery baseline', plannedFinishISO: '2028-03-31' })).ok).toBe(true);
    const baselineRevision = project.mobilisation!.baselines[0];
    expect((await construction.decideBaselineRevision(project.id, baselineRevision.id, 'approved')).ok).toBe(false);

    session.actor.mockResolvedValue({ ...manager(), userId: 'user-facility_manager' });
    expect((await construction.decideBaselineRevision(project.id, baselineRevision.id, 'approved')).ok).toBe(true);
    expect(project.plannedFinishISO).toBe('2028-03-31');
    expect((await construction.transitionProjectLifecycle(project.id, 'activate', 'Approved mobilisation is ready')).ok).toBe(true);
    expect((await construction.transitionProjectLifecycle(project.id, 'suspend', 'Funding release is temporarily delayed')).ok).toBe(true);
    expect((await construction.transitionProjectLifecycle(project.id, 'reopen', 'Funding release has now cleared')).ok).toBe(true);
    expect((await construction.transitionProjectLifecycle(project.id, 'start_closeout', 'Delivery is ready for controlled closeout')).ok).toBe(true);
    expect((await construction.transitionProjectLifecycle(project.id, 'complete', 'All project obligations are satisfied')).ok).toBe(true);
    expect(project.status).toBe('completed');
    expect((await construction.transitionProjectLifecycle(project.id, 'reopen', 'A post-completion defect needs controlled remediation')).ok).toBe(true);
    expect(project.status).toBe('active');
    expect(project.mobilisation?.lifecycle.map((row) => row.action)).toEqual(['activate', 'suspend', 'reopen', 'start_closeout', 'complete', 'reopen']);
  });
});
