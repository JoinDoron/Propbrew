import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import type { Project, Task, Variation } from '@/domain/construction/types';
import { forecastFinishISO, programmeNetwork } from '@/domain/construction';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { saveProjectCalendar, saveProjectPhase, saveProgrammeTask, submitBaselineRevision, decideBaselineRevision, recordProgrammeDelay } from '@/server/actions/construction';
import { proposeConstructionChange, requestConstructionChangePricing, submitConstructionChangeQuote, assessConstructionChange, decideConstructionChange, postConstructionChange } from '@/server/actions/construction-change-orders';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
const as = (userId: string, role: string) => boundary.actor.mockResolvedValue(actorForCompanyMember({
  membershipId: userId, userId, companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active',
  modules: { construction: 'manage' }, operationalProfileId: role, estateIds: [], allEstates: false,
  constructionProjectIds: ['cp-marina'], allConstructionProjects: false,
}, userId));
const project = () => (state.collections.constructionProjects as Project[]).find((row) => row.id === 'cp-marina')!;
const tasks = () => (state.collections.constructionTasks as Task[]).filter((row) => row.projectId === 'cp-marina');

beforeEach(() => { state = createDemoWorkspaceState(tenant); as('programme-manager', 'project-manager'); });

describe('Construction programme validation', () => {
  it('persists a coded delay in the live forecast, audits it and leaves approved dates untouched', async () => {
    const row = tasks().find((task) => task.status !== 'done')!;
    const originalFinish = row.plannedFinishISO;
    const originalBaseline = project().plannedFinishISO;
    const before = programmeNetwork(tasks(), project().mobilisation?.calendar ?? { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }, '2026-07-01').finishISO.get(row.id);
    expect((await run(() => recordProgrammeDelay(row.id, { workingDays: 3, reasonCodeId: 'rc-d2', note: 'Rain stopped slab pour.' }))).ok).toBe(true);
    expect(row.programmeDelay?.workingDays).toBe(3);
    expect(row.plannedFinishISO).toBe(originalFinish);
    expect(project().plannedFinishISO).toBe(originalBaseline);
    expect(programmeNetwork(tasks(), project().mobilisation?.calendar ?? { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] }, '2026-07-01').finishISO.get(row.id)).not.toBe(before);
    expect((state.collections.constructionReasonEvents as { subjectRef: string; impactDays: number }[]).at(-1)).toMatchObject({ subjectRef: row.id, impactDays: 3 });
    expect(await run(() => recordProgrammeDelay(row.id, { workingDays: 2, reasonCodeId: 'rc-v1' }))).toMatchObject({ ok: false });
    expect((await run(() => recordProgrammeDelay(row.id, { workingDays: 0, reasonCodeId: 'rc-d2' }))).ok).toBe(true);
    expect((state.collections.constructionReasonEvents as { impactDays: number }[]).at(-1)?.impactDays).toBe(-3);
  });
  it('carries a real task network through baseline approval, priced change, finance posting and revised baseline without double counting dates', async () => {
    const p = project();
    expect((await run(() => saveProjectCalendar(p.id, { name: 'Lagos site calendar', workingDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, timeZone: 'Africa/Lagos', holidays: ['2027-07-01'] }))).ok).toBe(true);
    expect((await run(() => saveProjectPhase({ projectId: p.id, name: 'Roof completion', startISO: '2027-01-04', finishISO: '2027-03-31', weight: 10 }))).ok).toBe(true);
    const phase = (state.collections.constructionPhases as { id: string; name: string }[]).find((row) => row.name === 'Roof completion')!;
    const first = { projectId: p.id, phaseId: phase.id, name: 'Roof reinforcement', owner: 'Site engineer', plannedStartISO: '2027-01-04', plannedFinishISO: '2027-01-09', priority: 'high' as const, dependsOn: [], budgetNaira: 1_000_000 };
    expect((await run(() => saveProgrammeTask(first))).ok).toBe(true);
    const reinforcement = tasks().find((row) => row.name === first.name)!;
    const pour = { ...first, name: 'Roof concrete pour', plannedStartISO: '2027-01-11', plannedFinishISO: '2027-01-16', dependsOn: [reinforcement.id], dependencyLags: { [reinforcement.id]: 3 } };
    expect((await run(() => saveProgrammeTask(pour))).ok).toBe(true);
    expect(await run(() => saveProgrammeTask({ ...pour, name: 'Invalid same-day start', plannedStartISO: '2027-01-09' }))).toMatchObject({ ok: false });
    const network = programmeNetwork(tasks(), p.mobilisation!.calendar);
    expect(network.startISO.get(tasks().find((row) => row.name === pour.name)!.id)).toBe('2027-01-14');
    expect(await run(() => submitBaselineRevision(p.id, { name: 'Too early', reason: 'Does not include the dependency gap', plannedFinishISO: '2027-01-16' }))).toMatchObject({ ok: false });

    expect((await run(() => submitBaselineRevision(p.id, { name: 'Contract programme', reason: 'Client delivery programme', plannedFinishISO: '2027-06-30' }))).ok).toBe(true);
    const b1 = p.mobilisation!.baselines[0];
    expect((await run(() => decideBaselineRevision(p.id, b1.id, 'approved'))).ok).toBe(false);
    as('programme-director', 'project-director');
    expect((await run(() => decideBaselineRevision(p.id, b1.id, 'approved'))).ok).toBe(true);
    expect(forecastFinishISO(p, 1)).toEqual({ iso: '2027-06-30', slipDays: 0 });

    as('programme-manager', 'project-manager');
    const created = await run(() => proposeConstructionChange({ projectId: p.id, sourceKind: 'site_issue', sourceId: 'is-m1', title: 'Additional slab reinforcement', reason: 'Site condition requires revised steel quantities.', costCode: 'MAR-SUP', subcontractorId: 'sub-buildright' }));
    expect(created.ok).toBe(true);
    const order = (state.collections.constructionVariations as Variation[]).find((row) => row.ref === (created.ok ? created.ref : ''))!;
    expect((await run(() => requestConstructionChangePricing(order.id))).ok).toBe(true);
    expect((await run(() => submitConstructionChangeQuote(order.id, { amountNaira: 10_000_000, reference: 'BR-Q-204', scope: 'Supply and install additional reinforcement.' }))).ok).toBe(true);
    as('programme-qs', 'quantity-surveyor');
    expect((await run(() => assessConstructionChange(order.id, { budgetDeltaNaira: 12_000_000, scheduleDays: 5, note: 'QS verified quantities and five working days.' }))).ok).toBe(true);
    as('programme-director', 'project-director');
    expect((await run(() => decideConstructionChange(order.id, { decision: 'approved', reference: 'CL-2027-07', note: 'Client authorises additional steel and time.' }))).ok).toBe(true);
    expect(forecastFinishISO(p, 1).iso).toBe('2027-06-30');
    as('programme-finance', 'construction-finance');
    expect((await run(() => postConstructionChange(order.id, { reference: 'FIN-2027-07' }))).ok).toBe(true);
    expect(forecastFinishISO(p, 1)).toEqual({ iso: '2027-07-07', slipDays: 7 });

    as('programme-manager', 'project-manager');
    expect((await run(() => submitBaselineRevision(p.id, { name: 'Approved change programme', reason: 'Incorporates client-approved slab change', plannedFinishISO: '2027-07-07' }))).ok).toBe(true);
    const b2 = p.mobilisation!.baselines[1];
    expect(b2.includedApprovedChangeDays).toBe(5);
    expect(p.plannedFinishISO).toBe('2027-06-30');
    as('programme-director', 'project-director');
    expect((await run(() => decideBaselineRevision(p.id, b2.id, 'approved'))).ok).toBe(true);
    expect(b1.status).toBe('superseded');
    expect(p.approvedChangeDaysInBaseline).toBe(5);
    expect(forecastFinishISO(p, 1)).toEqual({ iso: '2027-07-07', slipDays: 0 });
  });
});
