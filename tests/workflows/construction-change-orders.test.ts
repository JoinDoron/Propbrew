import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import type { CostCode, Project, Variation } from '@/domain/construction/types';
import { forecastFinishISO, projectEVMOf } from '@/domain/construction';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { repos } from '@/server/data';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import {
  assessConstructionChange, decideConstructionChange, postConstructionChange, proposeConstructionChange,
  requestConstructionChangePricing, submitConstructionChangeQuote,
} from '@/server/actions/construction-change-orders';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
const projects = () => state.collections.constructionProjects as Project[];
const codes = () => state.collections.constructionCostCodes as CostCode[];
const orders = () => state.collections.constructionVariations as Variation[];
const member = (userId: string, role: string, projectIds = ['cp-marina'], companyId = tenant) => actorForCompanyMember({
  membershipId: userId, userId, companyId, companyRole: 'member', status: 'active', companyStatus: 'active',
  modules: { construction: 'manage' }, operationalProfileId: role, estateIds: [], allEstates: false,
  constructionProjectIds: projectIds, allConstructionProjects: false,
}, userId)!;
const as = (userId: string, role: string, projectIds?: string[]) => boundary.actor.mockResolvedValue(member(userId, role, projectIds));
const proposal = () => ({ projectId: 'cp-marina', sourceKind: 'site_issue' as const, sourceId: 'is-m1',
  title: 'Additional reinforcement for slab', reason: 'Site condition requires a revised reinforcement layout.',
  costCode: 'MAR-SUP', subcontractorId: 'sub-buildright' });
const quote = { amountNaira: 10_000_000, reference: 'BR/Q-204', scope: 'Supply and install additional reinforcement at level four.' };
const assessment = { budgetDeltaNaira: 12_000_000, scheduleDays: 5, note: 'QS checked quantities, labour and contingency.' };

beforeEach(() => { state = createDemoWorkspaceState(tenant); as('change-pm', 'project-manager'); });

describe('Construction change-order financial boundary', () => {
  it('posts budget, contractor commitment and forecast only after separate pricing, QS, client and finance decisions', async () => {
    const project = projects().find((row) => row.id === 'cp-marina')!;
    const code = codes().find((row) => row.projectId === project.id && row.code === 'MAR-SUP')!;
    const budgetBefore = project.approvedBudget.minor, lineBefore = code.budget.minor, committedBefore = code.committed.minor;
    const forecastBefore = forecastFinishISO(project, projectEVMOf(project, codes()).spi).iso;
    const created = await run(() => proposeConstructionChange(proposal()));
    expect(created.ok).toBe(true);
    const order = orders().find((row) => row.ref === (created.ok ? created.ref : ''))!;
    expect(order).toMatchObject({ status: 'draft', changeOrder: { sourceKind: 'site_issue', sourceId: 'is-m1', costCode: 'MAR-SUP', subcontractorId: 'sub-buildright' } });
    expect((await run(() => submitConstructionChangeQuote(order.id, quote))).ok).toBe(false);
    expect((await run(() => postConstructionChange(order.id, { reference: 'FIN-01' }))).ok).toBe(false);
    expect((await run(() => requestConstructionChangePricing(order.id))).ok).toBe(true);
    expect((await run(() => submitConstructionChangeQuote(order.id, quote))).ok).toBe(true);
    expect(order).toMatchObject({ status: 'priced', changeOrder: { quote: { amountMinor: 1_000_000_000, recordedOnBehalf: true } } });
    expect((await run(() => assessConstructionChange(order.id, assessment))).ok).toBe(false);
    as('change-qs', 'quantity-surveyor');
    expect((await run(() => assessConstructionChange(order.id, { ...assessment, budgetDeltaNaira: 9_000_000 }))).ok).toBe(false);
    expect((await run(() => assessConstructionChange(order.id, assessment))).ok).toBe(true);
    expect(order.status).toBe('client_review');
    expect((await run(() => decideConstructionChange(order.id, { decision: 'approved', reference: 'CL-2026-07', note: 'Client approved the revised scope.' }))).ok).toBe(false);
    as('change-director', 'project-director');
    expect((await run(() => decideConstructionChange(order.id, { decision: 'approved', reference: 'CL-2026-07', note: 'Client approved the revised scope.' }))).ok).toBe(true);
    expect(order.status).toBe('ready_to_post');
    expect(project.approvedBudget.minor).toBe(budgetBefore);
    expect(code.budget.minor).toBe(lineBefore);
    expect(code.committed.minor).toBe(committedBefore);
    expect(forecastFinishISO(project, projectEVMOf(project, codes()).spi).iso).toBe(forecastBefore);
    expect((await run(() => postConstructionChange(order.id, { reference: 'FIN-01' }))).ok).toBe(false);
    as('change-finance', 'construction-finance');
    expect((await run(() => postConstructionChange(order.id, { reference: 'FIN-01' }))).ok).toBe(true);
    expect(project.approvedBudget.minor).toBe(budgetBefore + 1_200_000_000);
    expect(code.budget.minor).toBe(lineBefore + 1_200_000_000);
    expect(code.committed.minor).toBe(committedBefore + 1_000_000_000);
    expect(project.approvedChangeDays).toBe(5);
    expect(order).toMatchObject({ status: 'approved', changeOrder: { posting: { authorizationReference: 'FIN-01', budgetBeforeMinor: budgetBefore, budgetAfterMinor: budgetBefore + 1_200_000_000, commitmentBeforeMinor: committedBefore, commitmentAfterMinor: committedBefore + 1_000_000_000, forecastBeforeISO: forecastBefore } } });
    expect(order.changeOrder!.posting!.costForecastAfterMinor).toBeGreaterThan(order.changeOrder!.posting!.costForecastBeforeMinor);
    expect(projectEVMOf(project, codes()).eac).toBe(order.changeOrder!.posting!.costForecastAfterMinor);
    expect(order.changeOrder!.posting!.forecastAfterISO).not.toBe(forecastBefore);
    expect((await run(() => postConstructionChange(order.id, { reference: 'FIN-01' }))).ok).toBe(false);
    expect(project.approvedBudget.minor).toBe(budgetBefore + 1_200_000_000);
    expect((state.collections.constructionAudit as { entity: string; action: string; entityRef: string }[])).toEqual(expect.arrayContaining([expect.objectContaining({ entity: 'construction_change_order', action: 'post_cost', entityRef: order.ref })]));
  });

  it('rejects cross-company, cross-project and unauthorized source or contractor assignments without posting money', async () => {
    const before = projects().find((row) => row.id === 'cp-marina')!.approvedBudget.minor;
    expect((await run(() => proposeConstructionChange({ ...proposal(), sourceId: 'is-c1' }))).ok).toBe(false);
    expect((await run(() => proposeConstructionChange({ ...proposal(), subcontractorId: 'sub-finetouch' }))).ok).toBe(false);
    as('other-project', 'project-manager', ['cp-cedar']);
    expect((await run(() => proposeConstructionChange(proposal()))).ok).toBe(false);
    boundary.actor.mockResolvedValue(member('other-company', 'project-manager', ['cp-marina'], '1cd10a0c-2834-49a9-b3a3-7b1e7567800c'));
    expect((await run(() => proposeConstructionChange(proposal()))).ok).toBe(false);
    expect(projects().find((row) => row.id === 'cp-marina')!.approvedBudget.minor).toBe(before);
  });

  it('records a rejected client decision without budget or commitment changes', async () => {
    const project = projects().find((row) => row.id === 'cp-marina')!, code = codes().find((row) => row.projectId === project.id && row.code === 'MAR-SUP')!;
    const beforeBudget = project.approvedBudget.minor, beforeCommitted = code.committed.minor;
    const created = await run(() => proposeConstructionChange(proposal()));
    const order = orders().find((row) => row.ref === (created.ok ? created.ref : ''))!;
    await run(() => requestConstructionChangePricing(order.id));
    await run(() => submitConstructionChangeQuote(order.id, quote));
    as('other-qs', 'quantity-surveyor'); await run(() => assessConstructionChange(order.id, assessment));
    as('other-director', 'project-director');
    expect((await run(() => decideConstructionChange(order.id, { decision: 'rejected', reference: 'CL-REJ-01', note: 'Client declined the extra work.' }))).ok).toBe(true);
    expect(order.status).toBe('rejected');
    as('other-finance', 'construction-finance');
    expect((await run(() => postConstructionChange(order.id, { reference: 'FIN-02' }))).ok).toBe(false);
    expect(project.approvedBudget.minor).toBe(beforeBudget);
    expect(code.committed.minor).toBe(beforeCommitted);
  });

  it('keeps change orders inside assigned packages and subcontractors', async () => {
    const project = projects().find((row) => row.id === 'cp-marina')!;
    project.mobilisation = { workPackages: [
      { id: 'pack-structure', code: 'STR', name: 'Structure', costCode: 'MAR-SUP', budgetMinor: 0, status: 'active' },
      { id: 'pack-prelims', code: 'PRE', name: 'Preliminaries', costCode: 'MAR-PRE', budgetMinor: 0, status: 'active' },
    ] } as unknown as Project['mobilisation'];
    const issue = (state.collections.constructionIssues as { id: string; workPackageId?: string }[]).find((row) => row.id === 'is-m1')!;
    issue.workPackageId = 'pack-structure';
    const scoped = (userId: string, packages: string[], subcontractors?: string[]) => actorForCompanyMember({
      membershipId: userId, userId, companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active',
      modules: { construction: 'manage' }, operationalProfileId: subcontractors ? 'subcontractor' : 'site-engineer',
      estateIds: [], allEstates: false, constructionProjectIds: [project.id], allConstructionProjects: false,
      constructionPackageIds: packages, constructionSubcontractorIds: subcontractors,
    }, userId)!;
    boundary.actor.mockResolvedValue(scoped('other-package', ['pack-prelims']));
    expect((await run(() => proposeConstructionChange(proposal()))).ok).toBe(false);
    const proposer = scoped('pack-manager', ['pack-structure']);
    boundary.actor.mockResolvedValue(proposer);
    const created = await run(() => proposeConstructionChange(proposal()));
    expect(created.ok).toBe(true);
    const order = orders().find((row) => row.ref === (created.ok ? created.ref : ''))!;
    as('scope-pm', 'project-manager');
    await run(() => requestConstructionChangePricing(order.id));
    expect(run(() => repos.constructionVariations.list(scoped('other-package', ['pack-prelims'])).items.map((row) => row.id))).not.toContain(order.id);
    const wrongContractor = scoped('other-sub', ['pack-structure'], ['sub-meppro']);
    boundary.actor.mockResolvedValue(wrongContractor);
    expect((await run(() => submitConstructionChangeQuote(order.id, quote))).ok).toBe(false);
    expect(run(() => repos.constructionVariations.list(wrongContractor).items.map((row) => row.id))).not.toContain(order.id);
    boundary.actor.mockResolvedValue(scoped('right-sub', ['pack-structure'], ['sub-buildright']));
    expect((await run(() => submitConstructionChangeQuote(order.id, quote))).ok).toBe(true);
    expect(order.changeOrder?.quote?.recordedOnBehalf).toBe(false);
  });
});
